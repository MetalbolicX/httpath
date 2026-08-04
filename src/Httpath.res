// Httpath.res — lifecycle coordinator: CLI parse → HTTP server → Monitor → signals.
// Signal ownership: Httpath is the SOLE signal owner (per design Q3a).
// Monitor does NOT register SIGINT/SIGTERM handlers.

/// Start the HTTP server + Monitor with the given handler and config.
let start = (~handler: Http.handlerCb, ~config: Config.t): promise<unit> => {
  let controller = AbortController.make()
  let sig = AbortController.signal(controller)

  let onWsUpgrade = (
    req: Types.request,
    socket: Http.serverSocket,
    _head: Nullable.t<Http.upgradeHead>,
  ): promise<unit> =>
    switch Types.getHeader(req.headers, "sec-websocket-key") {
    | None =>
      Http.socketDestroy(socket)
      Promise.resolve()
    | Some(key) =>
      let accept = WsHandshake.computeAccept(key)
      let response = WsHandshake.handshakeResponse(accept)
      Http.socketWriteBuffer(socket, Buffer.fromString(response, "utf8"))
      ->Promise.then(result => {
        switch result {
        | Ok() => WsHub.register(socket)
        | Error(_) => Http.socketDestroy(socket)
        }
        Promise.resolve()
      })
    }

  let {server, closed} = Http.startServer(
    ~port=config.port,
    ~hostname=config.hostname,
    ~handler,
    ~onWsUpgrade,
    ~signal=sig,
  )

  // Allocate the monitor handle first so the onRestart closure can reference
  // it before Monitor.start returns (Monitor may invoke onRestart synchronously
  // on the first file event).
  let monitorHandle = ref((None: option<Monitor.handle>))

  let onRestart = () => {
    let _ = Http.closeServer(server)
    switch monitorHandle.contents {
    | Some(h) => Monitor.cancel(h)
    | None => ()
    }
    WsHub.closeAll()
    Restart.reload(
      ~execPath=Process.execPath,
      ~entrypoint=Belt.Option.getWithDefault(Process.argv[1], "bin.mjs"),
      ~argv=Array.slice(Process.argv, ~start=2, ~end=Array.length(Process.argv)),
    )
  }

  let handle = Monitor.start(
    ~dir=config.directory,
    ~ignorePatterns=config.ignorePatterns,
    ~enableLiveReload=config.enableLiveReload,
    ~restartOnChange=config.restartOnChange,
    ~onReload=WsHub.notifyReload,
    ~onRestart,
  )
  monitorHandle := Some(handle)

  let shutdown = () => {
    switch monitorHandle.contents {
    | Some(h) => Monitor.cancel(h)
    | None => ()
    }
    // Note: WsHub.closeAll() is intentionally omitted here — calling it before
    // server.close() races against in-flight WS upgrades (WsHub.register is called
    // before the upgrade handshake completes, so the socket would be closed mid-flight).
    // The hard-exit timer below handles cleanup instead.
    AbortController.abort(controller)
    // Hard-exit fallback: bound the shutdown so the process ALWAYS exits within 500ms,
    // even if the closed->Promise.then chain stalls on lingering connections.
    let _ = Timers.setTimeout(() => Process.exit(0), 500)
  }

  let sigintHandler = () => {shutdown()}
  let sigtermHandler = () => {shutdown()}

  Signals.onSignal("SIGINT", sigintHandler)
  Signals.onSignal("SIGTERM", sigtermHandler)

  // Wait for the server to finish closing before exiting.
  // The closed promise is resolved by Http.startServer's abort handler
  // after closeServer(server) completes, ensuring in-flight streams drain.
  closed->Promise.then(() => {
    let _ = Signals.offSignal("SIGINT", sigintHandler)
    let _ = Signals.offSignal("SIGTERM", sigtermHandler)
    let _ = Process.exit(0)
    Promise.resolve()
  })
}

/// Parse Process.argv and run the full lifecycle.
let main = (): promise<unit> => {
  let argv = Process.argv
  let args = Array.slice(argv, ~start=2, ~end=Array.length(argv))
  switch Parser.parse(args) {
  | Ok(config) =>
    let handler = Handler.make(config)
    start(~handler, ~config)
  | Error(ParseError.HelpRequested) =>
    Console.log(
      "Usage: httpath [-d <dir>] [-p <port>] [-i <patterns>] [--no-listing] [--no-live-reload] [-r] [-l] [--allow-protected-dir] [--log <level>]",
    )
    let _ = Process.exit(0)
    Promise.resolve()
  | Error(e) =>
    Console.error("Error: " ++ ParseError.toString(e))
    let _ = Process.exit(1)
    Promise.resolve()
  }
}
