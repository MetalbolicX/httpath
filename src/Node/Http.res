// Node/Http — HTTP server adapter using node:http.
// Converts Node IncomingMessage → Types.request, calls the handler callback,
// then writes Types.response (or delegates WS upgrade) to Node ServerResponse / Socket.

type server
type incomingMessage
type serverResponse
type serverSocket
type upgradeHead

// IncomingMessage accessors
@get external incomingMethod: incomingMessage => string = "method"
@get external incomingUrl: incomingMessage => string = "url"
// Node's req.headers. Most values are strings; multi-value (Set-Cookie) would be
// arrays, but we never read those headers. Bound as Dict.t<string> (honest type).
@get external incomingHeaders: incomingMessage => Dict.t<string> = "headers"

// ServerResponse methods (@send — instance methods)
@send external responseSetHeader: (serverResponse, string, string) => unit = "setHeader"
@send external responseWriteHead: (serverResponse, int) => serverResponse = "writeHead"
@send external responseEnd: (serverResponse, Nullable.t<string>) => unit = "end"

// ServerSocket (Duplex stream) methods for WS upgrade
@send external socketWrite: (serverSocket, string) => unit = "write"
@send external socketDestroy: (serverSocket) => unit = "destroy"

// socket.write(Buffer, callback) — callback receives error or null
@send external _writeBufferRaw: (serverSocket, Buffer.t, Nullable.t<JsExn.t> => unit) => bool = "write"

// socketWriteBuffer wraps the callback-based socket.write(Buffer) with a Promise.
// The callback resolves on null error (buffer flushed) and rejects on error.
// A synchronous throw (e.g., socket not writable) also rejects.
let socketWriteBuffer = (socket: serverSocket, buf: Buffer.t): promise<unit> => {
  Promise.make((resolve, reject) => {
    let settled = ref(false)
    let mark = (fn) => {
      if !settled.contents {
        settled := true
        fn()
      }
    }
    try {
      let _ = _writeBufferRaw(socket, buf, err => {
        mark(() => {
          switch Nullable.toOption(err) {
          | Some(_) => reject()
          | None => resolve()
          }
        })
      })
    } catch {
    | _ => mark(() => reject())
    }
  })
}

// Pipe a Node/Fs readStream into a ServerResponse (cross-module opaques).
@send external pipeStream: (Fs.readStream, serverResponse) => unit = "pipe"

// createServer / listen / close
@module("node:http")
external _createServer: ((incomingMessage, serverResponse) => promise<unit>) => server = "createServer"
@send external _listen: (server, int, string, unit => unit) => unit = "listen"
@send external _close: (server, (Nullable.t<JsExn.t>) => unit) => unit = "close"

// EventEmitter .on — used to register the 'upgrade' listener (the 'request'
// listener is registered via createServer's callback).
@send external _onUpgrade: (
  server,
  string,
  (incomingMessage, serverSocket, Nullable.t<upgradeHead>) => promise<unit>,
) => server = "on"

// AbortSignal.onabort setter.
@set external setOnAbort: (Signals.abortSignal, unit => unit) => unit = "onabort"

// Public callback types (used by Httpath)
type handlerCb = (Types.request) => promise<Types.outcome>
type upgradeCb = (Types.request, serverSocket, Nullable.t<upgradeHead>) => promise<unit>

// Build Types.request from an IncomingMessage (path strips query string).
let buildRequest = (req: incomingMessage): Types.request => {
  let method = incomingMethod(req)
  let url = incomingUrl(req)
  let rawHeaders = incomingHeaders(req)
  let keys = Dict.keysToArray(rawHeaders)
  let headers: array<(string, string)> = Array.make(~length=Array.length(keys), ("", ""))
  let i = ref(0)
  while i.contents < Array.length(keys) {
    let k = Array.get(keys, i.contents)->Option.getOr("")->String.toLowerCase
    let v = Dict.get(rawHeaders, k)->Option.getOr("")
    Array.set(headers, i.contents, (k, v))
    i.contents = i.contents + 1
  }
  let path = Js.String.split("?", url)->Array.get(0)->Option.getOr(url)
  {method, path, headers, clientIp: "127.0.0.1"}
}

// Write a Types.response to a ServerResponse (status + headers + body).
let writeResponse = (response: Types.response, res: serverResponse): promise<unit> => {
  Promise.make((resolve, _reject) => {
    let i = ref(0)
    while i.contents < Array.length(response.headers) {
      switch Array.get(response.headers, i.contents) {
      | Some((name, value)) => {
          let _ = responseSetHeader(res, name, value)
          ()
        }
      | None => ()
      }
      i.contents = i.contents + 1
    }
    let _ = responseWriteHead(res, response.status)
    switch response.body {
    | Types.File(path) => {
        let _ = Fs.createReadStream(path)->pipeStream(res)
        ()
      }
    | Types.Html(html) => {
        let _ = responseEnd(res, Nullable.make(html))
        ()
      }
    | Types.Empty => {
        let _ = responseEnd(res, Nullable.null)
        ()
      }
    }
    resolve()
  })
}

let closeServer = (s: server): promise<unit> => {
  Promise.make((resolve, _reject) => {
    let _ = _close(s, _err => resolve())
    ()
  })
}

let startServer = (
  ~port: int,
  ~hostname: string,
  ~handler: handlerCb,
  ~onWsUpgrade: upgradeCb,
  ~signal: Signals.abortSignal,
): promise<server> => {
  // 'request' event — normal HTTP. Build request, call handler, write response.
  let server = _createServer(async (req, res) => {
    let request = buildRequest(req)
    let outcome = try {
      await handler(request)
    } catch {
    | _ =>
      Types.Respond({
        status: 500,
        headers: [("content-type", "text/plain; charset=utf-8")],
        body: Types.Empty,
      })
    }
    switch outcome {
    | Types.Respond(r) => {
        let _ = await writeResponse(r, res)
        ()
      }
    | Types.WsUpgrade => ()
    }
  })

  // 'upgrade' event — WS upgrades. Build request, call handler, delegate to onWsUpgrade.
  let _ = _onUpgrade(server, "upgrade", async (req, socket, head) => {
    let request = buildRequest(req)
    let outcome = try {
      await handler(request)
    } catch {
    | _ =>
      Types.Respond({
        status: 500,
        headers: [("content-type", "text/plain; charset=utf-8")],
        body: Types.Empty,
      })
    }
    switch outcome {
    | Types.WsUpgrade => {
        let _ = await onWsUpgrade(request, socket, head)
        ()
      }
    | Types.Respond(_) => {
        let _ = socketDestroy(socket)
        ()
      }
    }
  })

  // Close on abort signal.
  let _ = setOnAbort(signal, () => {
    let _ = closeServer(server)
    ()
  })

  // Listen and resolve with the server.
  Promise.make((resolve, _reject) => {
    let _ = _listen(server, port, hostname, () => resolve(server))
    ()
  })
}
