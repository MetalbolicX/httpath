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

// Global timer — used to defer socket.destroy() so res.end() data flushes first.
@val external _setTimeout: (unit => unit, int) => float = "setTimeout"

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
@send external closeIdleConnections: server => unit = "closeIdleConnections"

// HTTPS server type and creators
type httpsOptions = {
  cert: Buffer.t,
  key: Buffer.t,
  minVersion: string,
  ciphers: string,
}
@module("node:https")
external _createHttpsServer: (httpsOptions, (incomingMessage, serverResponse) => promise<unit>) => httpsServer = "createServer"
@send external _httpsListen: (httpsServer, int, string, unit => unit) => unit = "listen"
@send external _httpsClose: (httpsServer, Nullable.t<JsExn.t> => unit) => unit = "close"
@send external httpsCloseIdleConnections: httpsServer => unit = "closeIdleConnections"

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

// Server timeout and connection-limit setters (Node server properties).
// Wrapped in functions to prevent tree-shaking; called via ignore() at call sites.
@set external _setRequestTimeout: (server, int) => unit = "requestTimeout"
@set external _setHeadersTimeout: (server, int) => unit = "headersTimeout"
@set external _setKeepAliveTimeout: (server, int) => unit = "keepAliveTimeout"
@set external _setMaxConnections: (server, int) => unit = "maxConnections"

@set external _setHttpsRequestTimeout: (httpsServer, int) => unit = "requestTimeout"
@set external _setHttpsHeadersTimeout: (httpsServer, int) => unit = "headersTimeout"
@set external _setHttpsKeepAliveTimeout: (httpsServer, int) => unit = "keepAliveTimeout"
@set external _setHttpsMaxConnections: (httpsServer, int) => unit = "maxConnections"

// Public callback types (used by Httpath)
type handlerCb = Types.request => promise<Types.outcome>
type upgradeCb = (Types.request, serverSocket, Nullable.t<upgradeHead>) => promise<unit>

// Server timeout/connection config — passed from Httpath.startServer.
type serverTimeouts = {
  requestTimeout: int,
  headersTimeout: int,
  keepAliveTimeout: int,
  maxConnections: int,
}

// serverDeps — all inputs needed to build handlers and server.
// Passed as a record so call sites pass one object rather than many args.
type serverDeps = {
  config: Config.t,
  authEntries: option<array<Basic.entry>>,
  rateLimiter: option<RateLimit.t>,
  authGate: option<AuthGate.t>,
  handler: handlerCb,
  onWsUpgrade: upgradeCb,
  accessLogDest: option<AccessLog.dest>,
  trustProxy: bool,
  tlsCertKey: option<Tls.certKeyPair>,
  serverTimeouts: serverTimeouts,
  signal: Signals.abortSignal,
}

// Wrapper functions — force tree-shaking to keep the @set externals.
// Each calls the @set external and returns unit (no meaningful return value).
let applyServerTimeouts = (s: server, t: serverTimeouts): unit => {
  ignore(_setRequestTimeout(s, t.requestTimeout))
  ignore(_setHeadersTimeout(s, t.headersTimeout))
  ignore(_setKeepAliveTimeout(s, t.keepAliveTimeout))
  ignore(_setMaxConnections(s, t.maxConnections))
}

let applyHttpsServerTimeouts = (s: httpsServer, t: serverTimeouts): unit => {
  ignore(_setHttpsRequestTimeout(s, t.requestTimeout))
  ignore(_setHttpsHeadersTimeout(s, t.headersTimeout))
  ignore(_setHttpsKeepAliveTimeout(s, t.keepAliveTimeout))
  ignore(_setHttpsMaxConnections(s, t.maxConnections))
}

// resolveClientIp — pure IP resolution logic.
// Honors X-Forwarded-For only when trustProxy is true AND the socket peer is in trustedCidrs.
// When trustProxy=true but trustedCidrs is empty, falls back to old behavior (XFF always honored).
// Takes socket IP as fallback; returns "unknown" when socket IP is absent.
let resolveClientIp = (
  ~trustProxy: bool,
  ~socketIp: string,
  ~headers: array<(string, string)>,
  ~trustedCidrs: array<string>=[],
): string => {
  if !trustProxy {
    if socketIp == "" {
      "unknown"
    } else {
      socketIp
    }
  } else {
    // Extract raw XFF strings from headers for passing to Ip.resolveClientIp.
    let xffValues: array<string> = {
      let rec findXff = (i: int): array<string> => {
        if i >= Array.length(headers) {
          []
        } else {
          switch Array.get(headers, i) {
          | Some((k, v)) =>
            if k == "x-forwarded-for" {
              if v == "" {
                []
              } else {
                let parts = Js.String.split(",", v)
                Belt.Array.map(parts, s => String.trim(s))
              }
            } else {
              findXff(i + 1)
            }
          | None => []
          }
        }
      }
      findXff(0)
    }
    if trustedCidrs->Array.length == 0 {
      // Backward-compat: old behavior — honor XFF unconditionally when trustProxy=true.
      switch xffValues->Array.get(0) {
      | Some(v) =>
        let trimmed = String.trim(v)
        if trimmed == "" { socketIp } else { trimmed }
      | None => socketIp
      }
    } else {
      Ip.resolveClientIp(~peer=socketIp, ~xff=xffValues, ~trustedCidrs)
    }
  }
}

// Build Types.request from an IncomingMessage (path strips query string).
let buildRequest = (~trustProxy: bool, ~socketIp: string, ~trustedCidrs: array<string>, req: incomingMessage): Types.request => {
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
  let clientIp = resolveClientIp(~trustProxy, ~socketIp, ~headers, ~trustedCidrs)
  let requestId = Request_Id.make()
  {method, path, headers, clientIp, requestId}
}

// Write a Types.response to a ServerResponse (status + headers + body).
// Sets x-request-id header from the request's generated UUID.
let writeResponse = (response: Types.response, res: serverResponse, ~requestId: string): promise<unit> => {
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
    // Always set x-request-id — correlates this response to the access log line
    let _ = responseSetHeader(res, "x-request-id", requestId)
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
// gate — delegates to Gate.evaluateGate for the pure decision.
// The gateDecision type and logic live in Security/Gate for testability
// and to avoid duplicating the security policy in two places.
// ---------------------------------------------------------------------------

let gate = (
  ~config: Config.t,
  ~authEntries: option<array<Basic.entry>>,
  ~rateLimiter: option<RateLimit.t>,
  ~authGate: option<AuthGate.t>,
  ~clientIp: string,
  ~req: Types.request,
): Gate.gateDecision =>
  Gate.evaluateGate(~config, ~authEntries, ~rateLimiter, ~authGate, ~clientIp, ~req)

// ---------------------------------------------------------------------------
// gateWs — WS upgrade gate. Delegates decision to Gate.evaluateGate then
// translates the rejection into a raw HTTP socket write.
// ---------------------------------------------------------------------------

let gateWs = (
  ~config: Config.t,
  ~authEntries: option<array<Basic.entry>>,
  ~rateLimiter: option<RateLimit.t>,
  ~authGate: option<AuthGate.t>,
  ~clientIp: string,
  ~req: Types.request,
  ~socket: serverSocket,
  ~continue: unit => unit,
): unit => {
  let originDecision = Gate.checkOrigin(
    ~headers=req.headers,
    ~host=Types.getHeader(req.headers, "host"),
  )
  switch originDecision {
  | Gate.Allowed =>
    switch Gate.evaluateGate(~config, ~authEntries, ~rateLimiter, ~authGate, ~clientIp, ~req) {
    | Gate.Allowed => continue()
    | Gate.Rejected({status, headers, body}) => {
        let headerLines = headers->Array.map(((k, v)) => `${k}: ${v}`)->Array.joinWith("\r\n")
        let reasonPhrase = status == 429
          ? "Too Many Requests"
          : status == 401
          ? "Unauthorized"
          : status == 403
          ? "Forbidden"
          : "Error"
        let response = `HTTP/1.1 ${Int.toString(status)} ${reasonPhrase}\r\n${headerLines}\r\nContent-Type: application/json\r\nContent-Length: ${Int.toString(String.length(body))}\r\nConnection: close\r\n\r\n${body}`
        socketWrite(socket, response)
        socketDestroy(socket)
      }
    }
  | Gate.Rejected({status, headers, body}) => {
      let headerLines = headers->Array.map(((k, v)) => `${k}: ${v}`)->Array.joinWith("\r\n")
      let reasonPhrase = status == 429
        ? "Too Many Requests"
        : status == 401
        ? "Unauthorized"
        : status == 403
        ? "Forbidden"
        : "Error"
      let response = `HTTP/1.1 ${Int.toString(status)} ${reasonPhrase}\r\n${headerLines}\r\nContent-Type: application/json\r\nContent-Length: ${Int.toString(String.length(body))}\r\nConnection: close\r\n\r\n${body}`
      socketWrite(socket, response)
      socketDestroy(socket)
    }
  }
}

// ---------------------------------------------------------------------------
// makeRequestHandler — builds the HTTP/HTTPS request handler closure.
// Captures deps at creation time; each call returns a fresh (req, res) => promise<unit>.
// No shared mutable state between requests.
// ---------------------------------------------------------------------------

let makeRequestHandler = (deps: serverDeps) => {
  let {config, authEntries, rateLimiter, authGate, handler, accessLogDest, trustProxy} = deps

  async (req, res) => {
    let socketIp = try {
      incomingSocket(req)->socketRemoteAddress
    } catch {
    | _ => "unknown"
    }
    let startMs = Date.now()
    let request = buildRequest(~trustProxy, ~socketIp, ~trustedCidrs=config.trustedProxies, req)

    let writeAccessLog = (~status: int, ~bytes: int) => {
      let ts = Date.make()->Date.toISOString
      let durationMs = Float.toInt(Date.now() -. startMs)
      let entry: AccessLog.line = {
        timestamp: ts,
        requestId: request.requestId,
        ip: request.clientIp,
        method: request.method,
        path: request.path,
        status,
        bytes,
        duration_ms: durationMs,
      }
      try {
        switch accessLogDest {
        | Some(dest) => AccessLog.emit(dest, entry)
        | None => ()
        }
      } catch {
      | _ => ()
      }
    }

    if config.lan {
      switch gate(
        ~config,
        ~authEntries,
        ~rateLimiter,
        ~authGate,
        ~clientIp=request.clientIp,
        ~req=request,
      ) {
      | Rejected({status, headers, body}) => {
          let r: Types.response = {
            status,
            headers,
            body: Types.Html(body),
          }
          writeAccessLog(~status, ~bytes=String.length(body))
          let _ = await writeResponse(r, res, ~requestId=request.requestId)
        }
      | Allowed => {
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
          switch (outcome, accessLogDest) {
          | (Types.Respond(r), Some(_)) => {
              let bytes = switch r.body {
              | Types.Html(s) => String.length(s)
              | Types.Empty => 0
              | Types.File(_) => {
                  let rec findContentLength = (i: int): int => {
                    if i >= Array.length(r.headers) {
                      0
                    } else {
                      switch r.headers[i] {
                      | Some(("content-length", v)) =>
                        switch Belt.Int.fromString(v) {
                        | Some(n) => n
                        | None => 0
                        }
                      | _ => findContentLength(i + 1)
                      }
                    }
                  }
                  findContentLength(0)
                }
              }
              writeAccessLog(~status=r.status, ~bytes)
            }
          | _ => ()
          }
          switch outcome {
          | Types.Respond(r) => {
              let _ = await writeResponse(r, res, ~requestId=request.requestId)
            }
          | Types.WsUpgrade => ()
          }
        }
      }
    } else {
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
      switch (outcome, accessLogDest) {
      | (Types.Respond(r), Some(_)) => {
          let bytes = switch r.body {
          | Types.Html(s) => String.length(s)
          | Types.Empty => 0
          | Types.File(_) => 0
          }
          writeAccessLog(~status=r.status, ~bytes)
        }
      | _ => ()
      }
      switch outcome {
      | Types.Respond(r) => {
          let _ = await writeResponse(r, res, ~requestId=request.requestId)
        }
      | Types.WsUpgrade => ()
      }
    }
  }
}

// ---------------------------------------------------------------------------
// makeUpgradeHandler — builds the WS upgrade handler closure.
// Captures deps at creation time; each call returns a fresh (req, socket, head) => promise<unit>.
// ---------------------------------------------------------------------------

let makeUpgradeHandler = (deps: serverDeps) => {
  let {config, authEntries, rateLimiter, authGate, handler, onWsUpgrade, accessLogDest, trustProxy} = deps

  async (req, socket, head) => {
    let socketIp = try {
      socketRemoteAddress(socket)
    } catch {
    | _ => "unknown"
    }
    let startMs = Date.now()
    let request = buildRequest(~trustProxy, ~socketIp, ~trustedCidrs=config.trustedProxies, req)

    let writeAccessLog101 = () => {
      let ts = Date.make()->Date.toISOString
      let durationMs = Float.toInt(Date.now() -. startMs)
      let entry: AccessLog.line = {
        timestamp: ts,
        requestId: request.requestId,
        ip: request.clientIp,
        method: request.method,
        path: request.path,
        status: 101,
        bytes: 0,
        duration_ms: durationMs,
      }
      try {
        switch accessLogDest {
        | Some(dest) => AccessLog.emit(dest, entry)
        | None => ()
        }
      } catch {
      | _ => ()
      }
    }

    let outcome = if config.lan {
      let gateAllowed = ref(false)
      gateWs(
        ~config,
        ~authEntries,
        ~rateLimiter,
        ~authGate,
        ~clientIp=request.clientIp,
        ~req=request,
        ~socket,
        ~continue=() => { gateAllowed := true },
      )
      if !gateAllowed.contents {
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
        writeAccessLog101()
        let _ = await onWsUpgrade(request, socket, head)
      }
    | Types.Respond(_) => {
        // Defer destroy to next tick so res.end() data reaches the kernel before
        // the socket is closed. Without this, socket.destroy() can abort the
        // response mid-flight causing ECONNRESET on the client side.
        let _ = _setTimeout(() => socketDestroy(socket), 50)
      }
    }
  }
}

// ---------------------------------------------------------------------------
// attachShutdown — wires the abort signal to server close + drain.
// Does NOT register signal handlers; the abort signal is owned by Httpath.res.
// Returns the `closed` promise that resolves after server.close completes.
// ---------------------------------------------------------------------------

let attachShutdown = (~server: serverVariant, ~signal: Signals.abortSignal): promise<unit> => {
  let closedResolve = ref((None: option<unit => unit>))
  let closed: promise<unit> = Promise.make((resolve, _reject) => {
    closedResolve := Some(resolve)
  })

  let _ = setOnAbort(signal, () => {
    // Close only idle sockets so in-flight requests can drain before shutdown.
    // closeIdleConnections is Node ≥22.
    switch server {
    | HttpServer(s) => closeIdleConnections(s)
    | HttpsServer(s) => httpsCloseIdleConnections(s)
    }
    let _ = closeServerVariant(server)->Promise.then(() => {
      switch closedResolve.contents {
      | Some(r) => r()
      | None => ()
      }
      Promise.resolve()
    })
  })

  closed
}

// ---------------------------------------------------------------------------
// startServer — orchestrates HTTP/HTTPS server creation and handler wiring.
// ~60 lines. Calls makeRequestHandler, makeUpgradeHandler, and attachShutdown.
// Signal handlers remain in Httpath.res (not here).
// ---------------------------------------------------------------------------

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
  ~authGate: option<AuthGate.t>,
  ~authEntries: option<array<Basic.entry>>,
  ~tlsCertKey: option<Tls.certKeyPair>,
  ~serverTimeouts: serverTimeouts,
): serverHandle => {
  // Access log destination:
  //   --access-log <path>  → File(path)
  //   --lan (no --access-log) → Stdout (matches README § "stdout (LAN default)")
  //   loopback (no --access-log) → None (keep developer terminal clean)
  let accessLogDest: option<AccessLog.dest> = switch accessLog {
  | Some(path) => Some(AccessLog.File(path))
  | None =>
    if config.lan {
      Some(AccessLog.Stdout)
    } else {
      None
    }
  }

  let deps = {
    config,
    authEntries,
    rateLimiter,
    authGate,
    handler,
    onWsUpgrade,
    accessLogDest,
    trustProxy,
    tlsCertKey,
    serverTimeouts,
    signal,
  }

  // Build handlers
  let requestHandler = makeRequestHandler(deps)
  let upgradeHandler = makeUpgradeHandler(deps)

  // Create HTTP or HTTPS server
  let serverVariant: serverVariant = switch tlsCertKey {
  | Some({cert, key}) =>
    let httpsServ = _createHttpsServer(
      {
        cert: cert,
        key: key,
        minVersion: "TLSv1.2",
        ciphers: "TLS_AES_128_GCM_SHA256:TLS_AES_256_GCM_SHA384:TLS_CHACHA20_POLY1305_SHA256:ECDHE-RSA-AES128-GCM-SHA256:ECDHE-RSA-AES256-GCM-SHA384",
      },
      requestHandler,
    )
    let _ = _onUpgradeHttps(httpsServ, "upgrade", upgradeHandler)
    let _ = applyHttpsServerTimeouts(httpsServ, serverTimeouts)
    HttpsServer(httpsServ)
  | None =>
    let httpServ = _createServer(requestHandler)
    let _ = _onUpgrade(httpServ, "upgrade", upgradeHandler)
    let _ = applyServerTimeouts(httpServ, serverTimeouts)
    HttpServer(httpServ)
  }

  // Wire shutdown via abort signal (owned by Httpath.res)
  let closed = attachShutdown(~server=serverVariant, ~signal)

  // Listen — fire-and-forget; server is usable immediately
  let listening = Promise.make((resolve, _reject) => {
    switch serverVariant {
    | HttpServer(s) => ignore(_listen(s, port, hostname, () => resolve()))
    | HttpsServer(s) => ignore(_httpsListen(s, port, hostname, () => resolve()))
    }
  })

  {server: serverVariant, closed, listening}
}
