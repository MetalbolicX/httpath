// Parser.res — manual CLI argument parser.
// Pure function: same argv always produces same Config or ParseError.
// No Deno stdlib dependency; uses Node.js bindings only.
// Defaults and validation match src/cli/parser.mts exactly.

@module("node:path") external resolvePath: string => string = "resolve"

// ---------------------------------------------------------------------------
// Flag specification table — module-level, no mutable refs captured here
// ---------------------------------------------------------------------------

type flagKind =
  | IsHelp
  | ValueLess(unit => unit)
  | TakesString(string => unit)
  | TakesInt(int => unit)
  | TakesLogLevel(Logger.logLevel => unit, Logger.mode => unit)

type flagSpec = {
  names: array<string>,
  kind: flagKind,
}

// NOTE: flagTable cannot be built here because the setters need to close over
// the mutable refs declared inside parse(). Instead, each flag's closure captures
// its ref at parse-time via partial application. See parse() for the actual table.

// ---------------------------------------------------------------------------
// Core parse function
// ---------------------------------------------------------------------------

let parse = (args: array<string>): result<Config.t, ParseError.t> => {
  // Mutable parsing state.
  let directory = ref((None: option<string>))
  let hostname = ref((None: option<string>))
  let port = ref((None: option<int>))
  let ignorePatterns = ref((None: option<array<string>>))
  let listing = ref(true)
  let noListing = ref(false)
  let noLiveReload = ref(false)
  let restartOnChange = ref(false)
  let logLevel = ref((None: option<Logger.logLevel>))
  let logMode = ref((None: option<Logger.mode>))
  let lan = ref(false)
  let allowProtectedDir = ref(false)
  let helpRequested = ref(false)
  let parseError = ref((None: option<ParseError.t>))
  // LAN security flags
  let trustProxy = ref(false)
  let trustedProxies = ref([])
  let allowCidrs = ref([])
  let authFile = ref((None: option<string>))
  let noAuth = ref(false)
  let noTls = ref(false)
  let tls = ref(false)
  let tlsCert = ref((None: option<string>))
  let tlsKey = ref((None: option<string>))
  let rateLimitMax = ref((None: option<int>))
  let rateLimitWindow = ref((None: option<int>))
  let authMaxFailures = ref((None: option<int>))
  let authLockoutMs = ref((None: option<int>))
  let accessLog = ref((None: option<string>))
  let readOnly = ref(false)
  let user = ref((None: option<string>))
  let group = ref((None: option<string>))
  let wsMaxPerIp = ref((None: option<int>))
  let wsMaxGlobal = ref((None: option<int>))

  let i = ref(0)
  let argsLen = Array.length(args)

  // ---------------------------------------------------------------------------
  // Flag specification table — all CLI flags in one place
  // ---------------------------------------------------------------------------

  // Each setter closes over the mutable refs declared above.
  // flagKind and flagSpec types are defined at module level.
  let flagTable: array<flagSpec> = [
    {names: ["--help", "-h"], kind: IsHelp},
    {
      names: ["--dir", "-d"],
      kind: TakesString(v => directory := Some(v)),
    },
    {
      names: ["--host"],
      kind: TakesString(v => hostname := Some(v)),
    },
    {
      names: ["--port", "-p"],
      kind: TakesInt(p => port := Some(p)),
    },
    {
      names: ["--ignore", "-i"],
      kind: TakesString(v => {
        let patterns = Js.String.split(",", v)->Array.map(String.trim)
        ignorePatterns := Some(patterns)
      }),
    },
    {names: ["--listing"], kind: ValueLess(() => listing := true)},
    {names: ["--no-listing"], kind: ValueLess(() => noListing := true)},
    {names: ["--no-live-reload"], kind: ValueLess(() => noLiveReload := true)},
    {names: ["--restart-on-change", "-r"], kind: ValueLess(() => restartOnChange := true)},
    {
      names: ["--log"],
      kind: TakesLogLevel(
        l => logLevel := Some(l),
        m => logMode := Some(m),
      ),
    },
    {names: ["--lan", "-l"], kind: ValueLess(() => lan := true)},
    {names: ["--allow-protected-dir"], kind: ValueLess(() => allowProtectedDir := true)},
    {
      names: ["--trust-proxy"],
      // Special: requires trustedProxies to be non-empty; handled inline below.
      kind: ValueLess(() => {
        if trustedProxies.contents->Array.length == 0 {
          parseError := Some(ParseError.TrustProxyWithoutTrustedProxies)
        } else {
          trustProxy := true
        }
      }),
    },
    {
      names: ["--trusted-proxies"],
      kind: TakesString(v => {
        let parts = Js.String.split(",", v)
        let cidrs = Js.Array.map(s => String.trim(s), parts)
        trustedProxies := cidrs
      }),
    },
    {
      names: ["--allow-cidr"],
      kind: TakesString(v => {
        let parts = Js.String.split(",", v)
        let cidrs = Js.Array.map(s => String.trim(s), parts)
        allowCidrs := cidrs
      }),
    },
    {names: ["--auth-file"], kind: TakesString(v => authFile := Some(v))},
    {names: ["--no-auth"], kind: ValueLess(() => noAuth := true)},
    {names: ["--no-tls"], kind: ValueLess(() => noTls := true)},
    {names: ["--tls"], kind: ValueLess(() => tls := true)},
    {names: ["--tls-cert"], kind: TakesString(v => tlsCert := Some(v))},
    {names: ["--tls-key"], kind: TakesString(v => tlsKey := Some(v))},
    {
      names: ["--rate-limit-max"],
      kind: TakesInt(n => {
        if n <= 0 {
          parseError := Some(ParseError.InvalidRateLimit("max", n))
        } else {
          rateLimitMax := Some(n)
        }
      }),
    },
    {
      names: ["--rate-limit-window"],
      kind: TakesInt(n => {
        if n <= 0 {
          parseError := Some(ParseError.InvalidRateLimit("window", n))
        } else {
          // Convert seconds to milliseconds.
          rateLimitWindow := Some(n * 1000)
        }
      }),
    },
    {
      names: ["--auth-max-failures"],
      kind: TakesInt(n => {
        if n < 0 {
          parseError := Some(ParseError.InvalidRateLimit("auth-max-failures", n))
        } else {
          authMaxFailures := Some(n)
        }
      }),
    },
    {
      names: ["--auth-lockout-ms"],
      kind: TakesInt(n => {
        if n <= 0 {
          parseError := Some(ParseError.InvalidRateLimit("auth-lockout-ms", n))
        } else {
          authLockoutMs := Some(n)
        }
      }),
    },
    {names: ["--access-log"], kind: TakesString(v => accessLog := Some(v))},
    {names: ["--read-only"], kind: ValueLess(() => readOnly := true)},
    {names: ["--user"], kind: TakesString(v => user := Some(v))},
    {names: ["--group"], kind: TakesString(v => group := Some(v))},
    {names: ["--ws-max-per-ip"], kind: TakesInt(n => wsMaxPerIp := Some(n))},
    {names: ["--ws-max-global"], kind: TakesInt(n => wsMaxGlobal := Some(n))},
  ]

  let removedFlags: array<string> = ["--rate-limit-max-requests", "--rate-limit-window-ms"]

  // Iterative flag parser — table-driven dispatch.
  while i.contents < argsLen && parseError.contents == None {
    let arg = args[i.contents]->Option.getOr("")

    // Check removed flags first.
    if Array.includes(removedFlags, arg) {
      parseError := Some(ParseError.RemovedFlag(arg))
      i := i.contents + 1
    } else {
      // Find matching flag spec.
      let spec = Belt.Array.getBy(flagTable, spec => Array.includes(spec.names, arg))
      switch spec {
      | Some({kind: IsHelp}) =>
        helpRequested := true
        i := i.contents + 1
      | Some({kind: ValueLess(apply)}) =>
        apply()
        i := i.contents + 1
      | Some({kind: TakesString(apply)}) =>
        if i.contents + 1 >= argsLen {
          parseError := Some(ParseError.MissingValue(arg))
        } else {
          apply(args[i.contents + 1]->Option.getOr(""))
          i := i.contents + 2
        }
      | Some({kind: TakesInt(apply)}) =>
        if i.contents + 1 >= argsLen {
          parseError := Some(ParseError.MissingValue(arg))
        } else {
          let v = Belt.Int.fromString(args[i.contents + 1]->Option.getOr(""))
          switch v {
          | None => parseError := Some(ParseError.InvalidPort(0))
          | Some(n) => apply(n)
          }
          i := i.contents + 2
        }
      | Some({kind: TakesLogLevel(applyLogLevel, applyLogMode)}) =>
        if i.contents + 1 >= argsLen {
          parseError := Some(ParseError.MissingValue(arg))
        } else {
          let v = args[i.contents + 1]->Option.getOr("")
          switch v {
          | "info"  => applyLogLevel(Logger.Info)
          | "debug" => applyLogLevel(Logger.Debug)
          | "error" => applyLogLevel(Logger.Error)
          | "json"  => applyLogMode(Logger.Json)
          | "plain" => applyLogMode(Logger.Plain)
          | _       => parseError := Some(ParseError.InvalidLogLevel(v))
          }
          i := i.contents + 2
        }
      | None =>
        if String.length(arg) > 0 && String.getUnsafe(arg, 0) == "-" {
          parseError := Some(ParseError.UnknownFlag(arg))
        }
        i := i.contents + 1
      }
    }
  }

  // Handle early exit conditions.
  switch parseError.contents {
  | Some(e) => Error(e)
  | None =>
    if helpRequested.contents {
      Error(ParseError.HelpRequested)
    } else {
      // Build the effective config.
      let effectiveDir = switch directory.contents {
      | Some(d) => resolvePath(d)
      | None => Process.cwd()
      }

      let effectiveHost = switch hostname.contents {
      | Some(h) => h
      | None =>
        if lan.contents {
          "0.0.0.0"
        } else {
          "127.0.0.1"
        }
      }

      // Plan 015: refuse non-loopback bind without explicit --lan.
      let isLoopback = switch effectiveHost {
      | "127.0.0.1" | "::1" | "localhost" => true
      | _ => false
      }

      let effectivePort = switch port.contents {
      | Some(p) => p
      | None => 8080
      }

      // Port and host validation.
      if !lan.contents && !isLoopback {
        Error(ParseError.PublicBindRequiresLan(effectiveHost))
      } else if effectivePort < 0 || effectivePort > 65535 {
        Error(ParseError.InvalidPort(effectivePort))
      } else {
        let effectiveIgnorePatterns = switch ignorePatterns.contents {
        | Some(patterns) => patterns
        | None => [".git", "node_modules", ".DS_Store", ".env", ".httpath-auth", ".npmrc"]
        }

        // Conflict: --no-tls is meaningless when explicit TLS material is provided.
        if noTls.contents && (tlsCert.contents != None || tlsKey.contents != None) {
          let conflicting = switch (tlsCert.contents, tlsKey.contents) {
          | (Some(c), Some(k)) => ["--tls-cert", c, "--tls-key", k]
          | (Some(c), None) => ["--tls-cert", c]
          | (None, Some(k)) => ["--tls-key", k]
          | (None, None) => []
          }
          Error(ParseError.ConflictingTlsFlags(conflicting))
        } else {
          let effectiveListing = listing.contents && !noListing.contents
          let effectiveLogLevel = switch logLevel.contents {
          | Some(l) => l
          | None => Logger.Info
          }
          // HTTPATH_LOG env is the fallback when --log json|plain is absent.
          // Precedence: --log flag → HTTPATH_LOG → default Json
          let effectiveLogMode = switch logMode.contents {
          | Some(m) => m
          | None =>
            switch Node_Process.get("HTTPATH_LOG") {
            | Some(v) =>
              if v == "plain" {
                Logger.Plain
              } else {
                // "json" or any other value → default to Json
                Logger.Json
              }
            | None => Logger.Json
            }
          }
          let effectiveLiveReload = !noLiveReload.contents

          // LAN security: effective values with LAN defaults
          // --tls flag is explicit on loopback; LAN default when no --tls but lan=true;
          // explicit cert+key (without --tls flag) also implies TLS on loopback.
          let effectiveTls = tls.contents ||
            (tlsCert.contents != None && tlsKey.contents != None) ||
            (lan.contents && !noTls.contents)
          let effectiveReadOnly = readOnly.contents || lan.contents
          let effectiveRateLimitMax = switch rateLimitMax.contents {
          | Some(m) => m
          | None =>
            if lan.contents { 100 } else { 0 }
          }
          let effectiveRateLimitWindow = switch rateLimitWindow.contents {
          | Some(w) => w
          | None =>
            if lan.contents { 60000 } else { 0 }
          }
          let effectiveRateLimitEnabled = lan.contents || rateLimitMax.contents != None || rateLimitWindow.contents != None

          Ok({
            directory: effectiveDir,
            hostname: effectiveHost,
            port: effectivePort,
            ignorePatterns: effectiveIgnorePatterns,
            enableDirectoryListing: effectiveListing,
            logLevel: effectiveLogLevel,
            logMode: effectiveLogMode,
            enableLiveReload: effectiveLiveReload,
            restartOnChange: restartOnChange.contents,
            lan: lan.contents,
            allowProtectedDir: allowProtectedDir.contents,
            trustProxy: trustProxy.contents,
            trustedProxies: trustedProxies.contents,
            allowCidrs: allowCidrs.contents,
            authFile: authFile.contents,
            noAuth: noAuth.contents,
            noTls: noTls.contents,
            tls: effectiveTls,
            tlsCert: tlsCert.contents,
            tlsKey: tlsKey.contents,
            rateLimitMax: effectiveRateLimitMax,
            rateLimitWindow: effectiveRateLimitWindow,
            rateLimitEnabled: effectiveRateLimitEnabled,
            authMaxFailures: switch authMaxFailures.contents {
            | Some(n) => n
            | None => 5
            },
            authLockoutMs: switch authLockoutMs.contents {
            | Some(n) => n
            | None => 30000
            },
            accessLog: accessLog.contents,
            readOnly: effectiveReadOnly,
            user: user.contents,
            group: group.contents,
            wsMaxPerIp: switch wsMaxPerIp.contents { | Some(n) => n | None => 2 },
            wsMaxGlobal: switch wsMaxGlobal.contents { | Some(n) => n | None => 3 },
          })
        }
      }
    }
  }
}
