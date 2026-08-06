// Httpath.res — lifecycle coordinator: CLI parse → HTTP/HTTPS server → Monitor → signals.
// Signal ownership: Httpath is the SOLE signal owner (per design Q3a).
// Monitor does NOT register SIGINT/SIGTERM handlers.

/// Start the HTTP/HTTPS server + Monitor with the given handler and config.
/// authEntries: auth file entries, if found (None if no file or --no-auth).
/// TLS is activated automatically when config.tls is true.
/// `draining` is shared with the Handler.make Probes module so /readyz can
/// observe SIGTERM state. Tests call start() directly and supply their own
/// `draining` is shared with the Handler.make Probes module so /readyz can observe SIGTERM state. Tests call start() directly and supply their own handler + ref; production calls through main() which destructures Handler.make to share the ref.
let start = (
  ~handler: Http.handlerCb,
  ~draining: ref<bool>,
  ~config: Config.t,
  ~authEntries: option<array<Basic.entry>>,
): promise<unit> => {
  // Apply log mode from config (covers both main() path and direct test calls)
  Logger.setMode(config.logMode)
  let controller = AbortController.make()
  let sig = AbortController.signal(controller)

  // Read server timeout/connection overrides from env vars (test escape hatch).
  // Defaults: requestTimeout=30000, headersTimeout=32000, keepAliveTimeout=5000, maxConnections=1024.
  let requestTimeout = Node_Process.getInt(~name="HTTPATH_REQUEST_TIMEOUT", ~default=30000)
  let headersTimeout = Node_Process.getInt(~name="HTTPATH_HEADERS_TIMEOUT", ~default=32000)
  let keepAliveTimeout = Node_Process.getInt(~name="HTTPATH_KEEP_ALIVE_TIMEOUT", ~default=5000)
  let maxConnections = Node_Process.getInt(~name="HTTPATH_MAX_CONNECTIONS", ~default=1024)
  let serverTimeouts: Http.serverTimeouts = {
    requestTimeout,
    headersTimeout,
    keepAliveTimeout,
    maxConnections,
  }

  // Rate limiter — only active when rateLimitEnabled is true
  // maxIps=10000 caps the in-memory map to prevent memory DoS from large LANs.
  let rateLimiter: option<RateLimit.t> = if config.rateLimitEnabled {
    Some(
      RateLimit.make(
        ~maxReq=config.rateLimitMax,
        ~windowMs=config.rateLimitWindow,
        ~maxIps=10000,
        ~now=() => Date.now(),
      ),
    )
  } else {
    None
  }

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
      let response = WsHandshake.handshakeResponse(~requestId=req.requestId, accept)
      Http.socketWriteBuffer(socket, Buffer.fromString(response, "utf8"))
      ->Promise.then(result => {
        switch result {
        | Ok() => WsHub.register(socket)
        | Error(_) => Http.socketDestroy(socket)
        }
        Promise.resolve()
      })
    }

  // ---------------------------------------------------------------------------
  // TLS cert/key — computed here for two reasons:
  // 1. main() calls start() with tlsCertKey already resolved
  // 2. Tests call start() directly; TLS must be computed here too.
  // ---------------------------------------------------------------------------
  let tlsKey: option<Tls.certKeyPair> = if config.tls {
    try {
      let hasCert = Belt.Option.isSome(config.tlsCert)
      let hasKey = Belt.Option.isSome(config.tlsKey)
      if hasCert && hasKey {
        Some(Tls.loadExplicitCert(~certPath=Belt.Option.getExn(config.tlsCert), ~keyPath=Belt.Option.getExn(config.tlsKey)))
      } else {
        let targetDir = Node_Path.join(Node_Os.homedir(), ".httpath")
        Some(Tls.generateSelfSigned(~targetDir))
      }
    } catch {
    | Tls.MissingTlsCert(path) =>
      Console.error(`Error: TLS certificate not found: ${path}`)
      let _ = Process.exit(1)
      None
    | Tls.MissingTlsKey(path) =>
      Console.error(`Error: TLS private key not found: ${path}`)
      let _ = Process.exit(1)
      None
    | Tls.MissingOpenssl(msg) =>
      Console.error(`Error: ${msg}`)
      let _ = Process.exit(1)
      None
    | Tls.TlsGenerationFailed(msg) =>
      Console.error(`Error: TLS certificate generation failed: ${msg}`)
      let _ = Process.exit(1)
      None
    }
  } else {
    None
  }

  let {server, closed, listening} = Http.startServer(
    ~port=config.port,
    ~hostname=config.hostname,
    ~handler,
    ~onWsUpgrade,
    ~signal=sig,
    ~trustProxy=config.trustProxy,
    ~accessLog=config.accessLog,
    ~config,
    ~rateLimiter,
    ~authEntries,
    ~tlsCertKey=tlsKey,
    ~serverTimeouts,
  )

  // Allocate the monitor handle first so the onRestart closure can reference
  // it before Monitor.start returns (Monitor may invoke onRestart synchronously
  // on the first file event).
  let monitorHandle = ref((None: option<Monitor.handle>))

  // Print startup banner after the server is listening.
  listening->Promise.then(() => {
    let addr = config.hostname == "0.0.0.0" ? "127.0.0.1" : config.hostname
    let protocol = switch tlsKey { | Some(_) => "https" | None => "http" }
    let url = `${protocol}://${addr}:${Int.toString(config.port)}`
    Logger.log(Logger.Info, `Serving ${config.directory} at ${url}`)
    Promise.resolve()
  })->ignore

  let onRestart = () => {
    let _ = Http.closeServerVariant(server)
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
    // Signal draining BEFORE closing connections so /readyz starts returning 503.
    draining := true
    switch monitorHandle.contents {
    | Some(h) => Monitor.cancel(h)
    | None => ()
    }
    // Destroy established WS sockets so server.close() can complete when no HTTP
    // requests are in-flight. Safe here because we only destroy sockets that
    // finished the upgrade handshake (WsHub.register was awaited). WsHub.closeAll
    // is skipped during a restart to avoid racing in-flight upgrades (see onRestart).
    WsHub.closeAll()
    AbortController.abort(controller)
    let exitTimer = ref((None: option<Timers.timeoutId>))
    // 30s lets in-flight HTTP requests drain via closeIdleConnections + server.close().
    exitTimer := Some(Timers.setTimeout(() => Process.exit(0), 30000))
    closed->Promise.then(() => {
      switch exitTimer.contents {
      | Some(id) => Timers.clearTimeout(id)
      | None => ()
      }
      Promise.resolve()
    })->ignore
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
    // Apply log mode from --log flag or HTTPATH_LOG env (precedence: flag → env → default Json)
    Logger.setMode(config.logMode)
    Logger.setLevel(config.logLevel)
    // Preflight auth file check: --lan requires auth unless --no-auth is set.
    let preflightAuth = config.lan && !config.noAuth
    let authEntries: option<array<Basic.entry>> = Basic.searchAuthFile(~explicitPath=config.authFile, ~directory=config.directory)
    if preflightAuth {
      switch authEntries {
      | None =>
        Console.error(
          "Error: --lan mode requires an auth file but none was found.\n" ++
          "To create one, run: node scripts/gen-auth.mjs <username>",
        )
        let _ = Process.exit(1)
        Promise.resolve()
      | Some(_) =>
        // Preflight: protected-directory guard (before start).
        // REF: plans/011-protected-directory-guard.md § "The three behaviors at the boundary".
        switch (ProtectedDir.classify(~directory=config.directory)) {
        | ProtectedDir.Allowed =>
          // TLS preflight: LAN without TLS logs a loud credential-sniffing warning.
          // REF: plans/012-enforce-tls-under-lan.md § "Preflight ordering".
          if config.lan && !config.tls && config.noTls {
            Console.error(
              `WARNING: --lan without TLS exposes Basic Auth credentials in plaintext.\n` ++
              `  Use --tls-cert/--tls-key or remove --lan.`,
            )
          }
          let {handler, drain: draining} = Handler.make(config)
          start(~handler, ~draining, ~config, ~authEntries)
        | ProtectedDir.Protected(rule, resolved) =>
          if config.allowProtectedDir {
            // Loud warning: user opted in but should still see the risk.
            Console.error(
              `WARNING: serving a protected system directory with --allow-protected-dir.\n` ++
              `  Resolved:  ${resolved}\n` ++
              `  Matched:   ${ProtectedDir.ruleToString(rule)}\n` ++
              `  Consider using --tls when exposing over --lan.`,
            )
            let {handler, drain: draining} = Handler.make(config)
            start(~handler, ~draining, ~config, ~authEntries)
          } else {
            // Refuse with actionable escape-hatch message.
            Console.error("Error: " ++ ParseError.toString(ProtectedDirRefused(config.directory, rule, resolved)))
            let _ = Process.exit(1)
            Promise.resolve()
          }
        }
      }
    } else {
      // Preflight: protected-directory guard (before start).
      // REF: plans/011-protected-directory-guard.md § "The three behaviors at the boundary".
      switch (ProtectedDir.classify(~directory=config.directory)) {
      | ProtectedDir.Allowed =>
        // TLS preflight: LAN without TLS logs a loud credential-sniffing warning.
        // REF: plans/012-enforce-tls-under-lan.md § "Preflight ordering".
        if config.lan && !config.tls && config.noTls {
          Console.error(
            `WARNING: --lan without TLS exposes Basic Auth credentials in plaintext.\n` ++
            `  Use --tls-cert/--tls-key or remove --lan.`,
          )
        }
        let {handler, drain: draining} = Handler.make(config)
        start(~handler, ~draining, ~config, ~authEntries)
      | ProtectedDir.Protected(rule, resolved) =>
        if config.allowProtectedDir {
          Console.error(
            `WARNING: serving a protected system directory with --allow-protected-dir.\n` ++
            `  Resolved:  ${resolved}\n` ++
            `  Matched:   ${ProtectedDir.ruleToString(rule)}\n` ++
            `  Consider using --tls when exposing over --lan.`,
          )
          let {handler, drain: draining} = Handler.make(config)
          start(~handler, ~draining, ~config, ~authEntries)
        } else {
          Console.error("Error: " ++ ParseError.toString(ProtectedDirRefused(config.directory, rule, resolved)))
          let _ = Process.exit(1)
          Promise.resolve()
        }
      }
    }
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
