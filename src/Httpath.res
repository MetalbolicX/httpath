// Httpath.res — lifecycle coordinator: CLI parse → HTTP server → Monitor → signals.
// Signal ownership: Httpath is the SOLE signal owner (per design Q3a).
// Monitor does NOT register SIGINT/SIGTERM handlers.

/// onRestart callback: warn that restart is not yet implemented.
let warnRestart = () => {
  Console.warn("[Httpath] restart-on-change requested but Restart module is not yet implemented")
}

/// Start the HTTP server + Monitor with the given handler and config.
let start = (
  ~handler: Http.handlerCb,
  ~config: Config.t,
): promise<unit> => {
  let controller = AbortController.make()
  let sig = AbortController.signal(controller)

  let onWsUpgrade = (_req: Types.request, socket: Http.serverSocket, _head: Nullable.t<Http.upgradeHead>): promise<unit> => {
    WsHub.register(socket)
    Promise.resolve()
  }

  let { server: _server, closed } = Http.startServer(
    ~port=config.port,
    ~hostname=config.hostname,
    ~handler,
    ~onWsUpgrade,
    ~signal=sig,
  )

  let monitorHandle = Monitor.start(
    ~dir=config.directory,
    ~ignorePatterns=config.ignorePatterns,
    ~enableLiveReload=config.enableLiveReload,
    ~restartOnChange=config.restartOnChange,
    ~onReload=WsHub.notifyReload,
    ~onRestart=warnRestart,
  )

  let shutdown = () => {
    Monitor.cancel(monitorHandle)
    WsHub.closeAll()
    AbortController.abort(controller)
  }

  let sigintHandler = () => { shutdown() }
  let sigtermHandler = () => { shutdown() }

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
    Console.log("Usage: httpath [-d <dir>] [-p <port>] [-i <patterns>] [--no-listing] [--no-live-reload] [-r] [-l] [--allow-protected-dir] [--log <level>]")
    let _ = Process.exit(0)
    Promise.resolve()
  | Error(e) =>
    Console.error("Error: " ++ ParseError.toString(e))
    let _ = Process.exit(1)
    Promise.resolve()
  }
}
