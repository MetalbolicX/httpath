// Node/Http — HTTP server adapter using node:http.
// Converts Node IncomingMessage → Types.request, calls the handler callback,
// then writes Types.response (or delegates WS upgrade) to Node ServerResponse / Socket.

type server
type httpsServer
type incomingMessage
type serverResponse
type serverSocket
type upgradeHead

// serverHandle — unified handle for both HTTP and HTTPS servers.
// The server field is a variant so Httpath.closeServer can call the right _close.
type serverVariant =
  | HttpServer(server)
  | HttpsServer(httpsServer)

type serverHandle = {
  server: serverVariant,
  closed: promise<unit>,
  listening: promise<unit>,
}

// IncomingMessage accessors
@get external incomingMethod: incomingMessage => string = "method"
@get external incomingUrl: incomingMessage => string = "url"
// Node's req.headers. Most values are strings; multi-value (Set-Cookie) would be
// arrays, but we never read those headers. Bound as Dict.t<string> (honest type).
@get external incomingHeaders: incomingMessage => Dict.t<string> = "headers"

// Socket for client IP resolution
@get external incomingSocket: incomingMessage => serverSocket = "socket"
@get external socketRemoteAddress: serverSocket => string = "remoteAddress"

// ServerResponse methods (@send — instance methods)
@send external responseSetHeader: (serverResponse, string, string) => unit = "setHeader"
@send external responseWriteHead: (serverResponse, int) => serverResponse = "writeHead"
@send external responseEnd: (serverResponse, Nullable.t<string>) => unit = "end"

// ServerSocket (Duplex stream) methods for WS upgrade
@send external socketWrite: (serverSocket, string) => unit = "write"
@send external socketDestroy: serverSocket => unit = "destroy"

// socket.write(Buffer, callback) — callback receives error or null
@send
external _writeBufferRaw: (serverSocket, Buffer.t, Nullable.t<JsExn.t> => unit) => bool = "write"

// socketWriteBuffer wraps the callback-based socket.write(Buffer) with a Promise.
// The callback resolves on null error (buffer flushed) and resolves with Error on error.
// A synchronous throw (e.g., socket not writable) also resolves with Error (best effort).
//
// Returns promise<result<unit, JsExn.t>> — Ok() on success, Error(err) on failure.
// This ensures errors are surfaced as values rather than unhandled rejections,
// since callers like WsHub.notifyReload are fire-and-forget.
let socketWriteBuffer = (socket: serverSocket, buf: Buffer.t): promise<result<unit, JsExn.t>> => {
  Promise.make((resolve, _reject) => {
    let settled = ref(false)
    let mark = fn => {
      if !settled.contents {
        settled := true
        fn()
      }
    }
    try {
      let _ = _writeBufferRaw(socket, buf, err => {
        mark(
          () => {
            switch Nullable.toOption(err) {
            | Some(e) => resolve(Error(e))
            | None => resolve(Ok())
            }
          },
        )
      })
    } catch {
    | _ => mark(() => resolve(Ok()))
    }
  })
}

// Pipe a Node/Fs readStream into a ServerResponse (cross-module opaques).
@send external pipeStream: (Fs.readStream, serverResponse) => unit = "pipe"

// createServer / listen / close — HTTP
@module("node:http")
external _createServer: ((incomingMessage, serverResponse) => promise<unit>) => server =
  "createServer"
@send external _listen: (server, int, string, unit => unit) => unit = "listen"
@send external _close: (server, Nullable.t<JsExn.t> => unit) => unit = "close"
@send external closeAllConnections: server => unit = "closeAllConnections"

// HTTPS server type and creators
type httpsOptions = {cert: Buffer.t, key: Buffer.t}
@module("node:https")
external _createHttpsServer: (httpsOptions, (incomingMessage, serverResponse) => promise<unit>) => httpsServer = "createServer"
@send external _httpsListen: (httpsServer, int, string, unit => unit) => unit = "listen"
@send external _httpsClose: (httpsServer, Nullable.t<JsExn.t> => unit) => unit = "close"
@send external httpsCloseAllConnections: httpsServer => unit = "closeAllConnections"

// EventEmitter .on — used to register the 'upgrade' listener (the 'request'
// listener is registered via createServer's callback).
@send
external _onUpgrade: (
  server,
  string,
  (incomingMessage, serverSocket, Nullable.t<upgradeHead>) => promise<unit>,
) => server = "on"

// HTTPS upgrade event registration
@send
external _onUpgradeHttps: (
  httpsServer,
  string,
  (incomingMessage, serverSocket, Nullable.t<upgradeHead>) => promise<unit>,
) => httpsServer = "on"

// AbortSignal.onabort setter.
@set external setOnAbort: (Signals.abortSignal, unit => unit) => unit = "onabort"

// Public callback types (used by Httpath)
type handlerCb = Types.request => promise<Types.outcome>
type upgradeCb = (Types.request, serverSocket, Nullable.t<upgradeHead>) => promise<unit>

// resolveClientIp — pure IP resolution logic.
// Honors X-Forwarded-For only when trustProxy is true.
// Takes socket IP as fallback; returns "unknown" when socket IP is absent.
let resolveClientIp = (
  ~trustProxy: bool,
  ~socketIp: string,
  ~headers: array<(string, string)>,
): string => {
  let ip = if trustProxy {
    let rec findXff = (i: int): string => {
      if i >= Array.length(headers) {
        socketIp
      } else {
        switch Array.get(headers, i) {
        | Some((k, v)) =>
          if k == "x-forwarded-for" {
            if v == "" {
              socketIp
            } else {
              let parts = Js.String.split(",", v)
              let first = Array.get(parts, 0)->Belt.Option.getWithDefault(v)
              String.trim(first)
            }
          } else {
            findXff(i + 1)
          }
        | None => socketIp
        }
      }
    }
    findXff(0)
  } else {
    socketIp
  }
  if ip == "" || ip == "::" || ip == "::1" {
    "unknown"
  } else {
    ip
  }
}

// Build Types.request from an IncomingMessage (path strips query string).
let buildRequest = (~trustProxy: bool, ~socketIp: string, req: incomingMessage): Types.request => {
  let method = incomingMethod(req)
  let url = incomingUrl(req)
  let rawHeaders = incomingHeaders(req)
  let keys = Dict.keysToArray(rawHeaders)
  let headers: array<(string, string)> = Array.make(~length=Array.length(keys), ("", ""))
  let i = ref(0)
  while i.contents < Array.length(keys) {
    let k = keys[i.contents]->Option.getOr("")->String.toLowerCase
    let v = Dict.get(rawHeaders, k)->Option.getOr("")
    headers[i.contents] = (k, v)
    i.contents = i.contents + 1
  }
  let path = Js.String.split("?", url)->Array.get(0)->Option.getOr(url)
  let clientIp = resolveClientIp(~trustProxy, ~socketIp, ~headers)
  {method, path, headers, clientIp}
}

// Write a Types.response to a ServerResponse (status + headers + body).
let writeResponse = (response: Types.response, res: serverResponse): promise<unit> => {
  Promise.make((resolve, _reject) => {
    let i = ref(0)
    while i.contents < Array.length(response.headers) {
      switch response.headers[i.contents] {
      | Some((name, value)) => {
          let _ = responseSetHeader(res, name, value)
        }
      | None => ()
      }
      i.contents = i.contents + 1
    }
    let _ = responseWriteHead(res, response.status)
    switch response.body {
    | Types.File(path) => {
        let _ = Fs.createReadStream(path)->pipeStream(res)
      }
    | Types.Html(html) => {
        let _ = responseEnd(res, Nullable.make(html))
      }
    | Types.Empty => {
        let _ = responseEnd(res, Nullable.null)
      }
    }
    resolve()
  })
}

let closeServer = (s: server): promise<unit> => {
  Promise.make((resolve, _reject) => {
    let _ = _close(s, _err => resolve())
  })
}

// closeServerVariant — close the appropriate server type based on variant.
let closeServerVariant = (sv: serverVariant): promise<unit> => {
  switch sv {
  | HttpServer(s) => closeServer(s)
  | HttpsServer(s) =>
    Promise.make((resolve, _reject) => {
      let _ = _httpsClose(s, _err => resolve())
    })
  }
}

// ---------------------------------------------------------------------------
// extractCredentials — parse Basic auth header, find user, verify password.
// Local definition in Http.res to avoid cross-module tree-shaking elimination.
// ---------------------------------------------------------------------------

@module("./BufferImpl.mjs")
external bufferToString: (Buffer.t, string) => string = "toString"

let extractCredentials = (
  ~authHeader: option<string>,
  ~entries: array<Basic.entry>,
): option<string> => {
  switch authHeader {
  | None => None
  | Some(header) =>
    if !String.startsWith(header, "Basic ") {
      None
    } else {
      let encoded = String.substring(header, ~start=6, ~end=String.length(header))
      let decodedBuf: Buffer.t = try {
        Buffer.fromString(encoded, "base64")
      } catch {
      | _ => Buffer.fromString("", "utf8")
      }
      let decoded = bufferToString(decodedBuf, "utf8")
      let colonPos = Js.String.indexOf(":", decoded)
      if colonPos < 0 {
        None
      } else {
        let username = String.substring(decoded, ~start=0, ~end=colonPos)
        let password = String.substring(decoded, ~start=colonPos + 1, ~end=String.length(decoded))
        switch Basic.findUser(entries, username) {
        | None => None
        | Some(entry) =>
          if Basic.verify(entry, password) {
            Some(username)
          } else {
            None
          }
        }
      }
    }
  }
}

// ---------------------------------------------------------------------------
// gate — rate-limit first, then auth (unless noAuth), then call continue.
// Gate runs ONLY when config.lan is true.
// Rate limit is checked only when config.rateLimitEnabled is true.
// Auth is checked only when config.noAuth is false.
// Writes 429/401 directly to res/socket on rejection.
// ---------------------------------------------------------------------------

let gate = (
  ~config: Config.t,
  ~authEntries: option<array<Basic.entry>>,
  ~rateLimiter: option<RateLimit.t>,
  ~clientIp: string,
  ~req: Types.request,
  ~res: serverResponse,
  ~continue: unit => unit,
): unit => {
  // Rate limit first (cheaper, prevents brute-force on auth)
  if config.rateLimitEnabled {
    switch rateLimiter {
    | Some(limiter) =>
      switch RateLimit.tick(limiter, clientIp) {
      | RateLimit.Reject({retryAfterSeconds}) => {
          let _ = responseSetHeader(res, "Retry-After", Int.toString(retryAfterSeconds))
          let _ = responseWriteHead(res, 429)
          let _ = responseEnd(res, Nullable.make(`{"error":"Too many requests"}`))
        }
      | RateLimit.Allow => ()
      }
    | None => ()
    }
  }
  // Auth check (skip if noAuth is set)
  if !config.noAuth {
    // Extract credentials from Authorization header
    let authHeader = Types.getHeader(req.headers, "authorization")
    switch authEntries {
    | None =>
      // No auth file entries available — reject
      {
        let _ = responseSetHeader(res, "WWW-Authenticate", `Basic realm="httpath"`)
        let _ = responseWriteHead(res, 401)
        let _ = responseEnd(res, Nullable.make(`{"error":"Authentication required"}`))
      }
    | Some(entries) =>
      switch extractCredentials(~authHeader, ~entries) {
      | Some(_) => continue()
      | None => {
          let _ = responseSetHeader(res, "WWW-Authenticate", `Basic realm="httpath"`)
          let _ = responseWriteHead(res, 401)
          let _ = responseEnd(res, Nullable.make(`{"error":"Authentication required"}`))
        }
      }
    }
  } else {
    continue()
  }
}

// ---------------------------------------------------------------------------
// gateWs — WS upgrade gate. Writes HTTP rejection directly to socket.
// ---------------------------------------------------------------------------

let gateWs = (
  ~config: Config.t,
  ~authEntries: option<array<Basic.entry>>,
  ~rateLimiter: option<RateLimit.t>,
  ~clientIp: string,
  ~req: Types.request,
  ~socket: serverSocket,
  ~continue: unit => unit,
): unit => {
  // Rate limit check first
  if config.rateLimitEnabled {
    switch rateLimiter {
    | Some(limiter) =>
      switch RateLimit.tick(limiter, clientIp) {
      | RateLimit.Reject({retryAfterSeconds}) => {
          let body = `{"error":"Too many requests"}`
          let response = `HTTP/1.1 429 Too Many Requests\r\nRetry-After: ${Int.toString(retryAfterSeconds)}\r\nContent-Type: application/json\r\nContent-Length: ${Int.toString(String.length(body))}\r\nConnection: close\r\n\r\n${body}`
          socketWrite(socket, response)
          socketDestroy(socket)
        }
      | RateLimit.Allow => ()
      }
    | None => ()
    }
  }
  // Auth check
  if !config.noAuth {
    let authHeader = Types.getHeader(req.headers, "authorization")
    switch authEntries {
    | None =>
      // No auth entries — reject
      {
        let body = `{"error":"Authentication required"}`
        let response = `HTTP/1.1 401 Unauthorized\r\nWWW-Authenticate: Basic realm="httpath"\r\nContent-Type: application/json\r\nContent-Length: ${Int.toString(String.length(body))}\r\nConnection: close\r\n\r\n${body}`
        socketWrite(socket, response)
        socketDestroy(socket)
      }
    | Some(entries) =>
      switch extractCredentials(~authHeader, ~entries) {
      | Some(_) => continue()
      | None => {
          let body = `{"error":"Authentication required"}`
          let response = `HTTP/1.1 401 Unauthorized\r\nWWW-Authenticate: Basic realm="httpath"\r\nContent-Type: application/json\r\nContent-Length: ${Int.toString(String.length(body))}\r\nConnection: close\r\n\r\n${body}`
          socketWrite(socket, response)
          socketDestroy(socket)
        }
      }
    }
  } else {
    continue()
  }
}

let startServer = (
  ~port: int,
  ~hostname: string,
  ~handler: handlerCb,
  ~onWsUpgrade: upgradeCb,
  ~signal: Signals.abortSignal,
  ~trustProxy: bool,
  ~accessLog: option<string>,
  ~config: Config.t,
  ~rateLimiter: option<RateLimit.t>,
  ~authEntries: option<array<Basic.entry>>,
  ~tlsCertKey: option<Tls.certKeyPair>,
): serverHandle => {
  // Access log destination — None means no access logging
  let accessLogDest: option<AccessLog.dest> = switch accessLog {
  | Some(path) => Some(AccessLog.File(path))
  | None => None
  }

  // 'request' event — normal HTTP/HTTPS. Build request, apply gate, call handler, write response.
  let requestHandler = async (req, res) => {
    let socketIp = try {
      incomingSocket(req)->socketRemoteAddress
    } catch {
    | _ => "unknown"
    }
    let request = buildRequest(~trustProxy, ~socketIp, req)
    // Apply gate before handler — gate writes rejection directly if denied
    let outcome = if config.lan {
      let gateAllowed = ref(false)
      gate(
        ~config,
        ~authEntries,
        ~rateLimiter,
        ~clientIp=request.clientIp,
        ~req=request,
        ~res,
        ~continue=() => { gateAllowed := true },
      )
      if !gateAllowed.contents {
        // Gate wrote the rejection response; outcome is discarded but
        // we still need a valid outcome to satisfy the switch below.
        Types.Respond({status: 0, headers: [], body: Types.Empty})
      } else {
        try {
          await handler(request)
        } catch {
        | _ =>
          Types.Respond({
            status: 500,
            headers: [("content-type", "text/plain; charset=utf-8")],
            body: Types.Empty,
          })
        }
      }
    } else {
      try {
        await handler(request)
      } catch {
      | _ =>
        Types.Respond({
          status: 500,
          headers: [("content-type", "text/plain; charset=utf-8")],
          body: Types.Empty,
        })
      }
    }
    // Emit access log after response is written
    switch (outcome, accessLogDest) {
    | (Types.Respond(r), Some(dest)) =>
      let ts = Date.make()->Date.toISOString
      let line = AccessLog.format({
        timestamp: ts,
        ip: request.clientIp,
        method: request.method,
        path: request.path,
        status: r.status,
        bytes: 0, // TODO: track actual bytes written
      })
      try {
        AccessLog.writeLine(dest, line)
      } catch {
      | _ => ()
      }
    | _ => ()
    }
    switch outcome {
    | Types.Respond(r) => {
        let _ = await writeResponse(r, res)
      }
    | Types.WsUpgrade => ()
    }
  }

  // 'upgrade' event — WS upgrades. Build request, apply gate, call handler, delegate to onWsUpgrade.
  let upgradeHandler = async (req, socket, head) => {
    let socketIp = try {
      socketRemoteAddress(socket)
    } catch {
    | _ => "unknown"
    }
    let request = buildRequest(~trustProxy, ~socketIp, req)
    // Apply gate before handler — gate writes rejection directly to socket if denied
    let outcome = if config.lan {
      let gateAllowed = ref(false)
      gateWs(
        ~config,
        ~authEntries,
        ~rateLimiter,
        ~clientIp=request.clientIp,
        ~req=request,
        ~socket,
        ~continue=() => { gateAllowed := true },
      )
      if !gateAllowed.contents {
        // Gate wrote the rejection to socket; still need a valid outcome to satisfy switch.
        Types.Respond({status: 0, headers: [], body: Types.Empty})
      } else {
        try {
          await handler(request)
        } catch {
        | _ =>
          Types.Respond({
            status: 500,
            headers: [("content-type", "text/plain; charset=utf-8")],
            body: Types.Empty,
          })
        }
      }
    } else {
      try {
        await handler(request)
      } catch {
      | _ =>
        Types.Respond({
          status: 500,
          headers: [("content-type", "text/plain; charset=utf-8")],
          body: Types.Empty,
        })
      }
    }
    switch outcome {
    | Types.WsUpgrade => {
        let _ = await onWsUpgrade(request, socket, head)
      }
    | Types.Respond(_) => {
        let _ = socketDestroy(socket)
      }
    }
  }

  // Create HTTP or HTTPS server based on tlsCertKey.
  // Both server types register the same handlers; only the createServer call differs.
  let serverVariant: serverVariant = switch tlsCertKey {
  | Some({cert, key}) =>
    let httpsServ = _createHttpsServer({cert: cert, key: key}, requestHandler)
    let _ = _onUpgradeHttps(httpsServ, "upgrade", upgradeHandler)
    HttpsServer(httpsServ)
  | None =>
    let httpServ = _createServer(requestHandler)
    let _ = _onUpgrade(httpServ, "upgrade", upgradeHandler)
    HttpServer(httpServ)
  }

  // closed — resolved by the abort handler after the server is closed.
  // This is the promise Httpath awaits before calling Process.exit.
  let closedResolve = ref((None: option<unit => unit>))
  let closed: promise<unit> = Promise.make((resolve, _reject) => {
    closedResolve := Some(resolve)
  })

  // Close on abort signal; resolve closed after closeServer completes.
  let _ = setOnAbort(signal, () => {
    // Force-close all connections first so closeServer unblocks immediately.
    // This handles the case where a keep-alive or WS connection is holding
    // the server open. closeAllConnections is Node ≥22.
    switch serverVariant {
    | HttpServer(s) => closeAllConnections(s)
    | HttpsServer(s) => httpsCloseAllConnections(s)
    }
    let _ = closeServerVariant(serverVariant)->Promise.then(() => {
      switch closedResolve.contents {
      | Some(r) => r()
      | None => ()
      }
      Promise.resolve()
    })
  })

  // Listen and return the server handle.
  // The listen promise is fire-and-forget (listen happens async);
  // the server is usable immediately. closed resolves on abort.
  let _listenPromise = Promise.make((resolve, _reject) => {
    switch serverVariant {
    | HttpServer(s) => ignore(_listen(s, port, hostname, () => resolve()))
    | HttpsServer(s) => ignore(_httpsListen(s, port, hostname, () => resolve()))
    }
  })

  {server: serverVariant, closed, listening: _listenPromise}
}
