// Parser.res — manual CLI argument parser.
// Pure function: same argv always produces same Config or ParseError.
// No Deno stdlib dependency; uses Node.js bindings only.
// Defaults and validation match src/cli/parser.mts exactly.

@module("node:path") external resolvePath: string => string = "resolve"

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
  let authFile = ref((None: option<string>))
  let noAuth = ref(false)
  let noTls = ref(false)
  let tls = ref(false)
  let tlsCert = ref((None: option<string>))
  let tlsKey = ref((None: option<string>))
  let rateLimitMax = ref((None: option<int>))
  let rateLimitWindow = ref((None: option<int>))
  let accessLog = ref((None: option<string>))
  let readOnly = ref(false)

  let i = ref(0)
  let argsLen = Array.length(args)

  // Iterative flag parser — stops if an error is encountered.
  while i.contents < argsLen && parseError.contents == None {
    let arg = args[i.contents]->Option.getOr("")

    if arg == "--help" || arg == "-h" {
      helpRequested := true
      i := i.contents + 1
    } else if arg == "--dir" || arg == "-d" {
      if i.contents + 1 >= argsLen {
        parseError := Some(ParseError.MissingValue(arg))
      } else {
        directory := Some(args[i.contents + 1]->Option.getOr(""))
        i := i.contents + 2
      }
    } else if arg == "--host" {
      if i.contents + 1 >= argsLen {
        parseError := Some(ParseError.MissingValue(arg))
      } else {
        hostname := Some(args[i.contents + 1]->Option.getOr(""))
        i := i.contents + 2
      }
    } else if arg == "--port" || arg == "-p" {
      if i.contents + 1 >= argsLen {
        parseError := Some(ParseError.MissingValue(arg))
      } else {
        let portStr = args[i.contents + 1]->Option.getOr("")
        let portNum = Belt.Int.fromString(portStr)
        switch portNum {
        | None => parseError := Some(ParseError.InvalidPort(0))
        | Some(p) => port := Some(p)
        }
        i := i.contents + 2
      }
    } else if arg == "--ignore" || arg == "-i" {
      if i.contents + 1 >= argsLen {
        parseError := Some(ParseError.MissingValue(arg))
      } else {
        let patternStr = args[i.contents + 1]->Option.getOr("")
        let patterns = Js.String.split(",", patternStr)->Array.map(String.trim)
        ignorePatterns := Some(patterns)
        i := i.contents + 2
      }
    } else if arg == "--listing" {
      listing := true
      i := i.contents + 1
    } else if arg == "--no-listing" {
      noListing := true
      i := i.contents + 1
    } else if arg == "--no-live-reload" {
      noLiveReload := true
      i := i.contents + 1
    } else if arg == "--restart-on-change" || arg == "-r" {
      restartOnChange := true
      i := i.contents + 1
    } else if arg == "--log" {
      if i.contents + 1 >= argsLen {
        parseError := Some(ParseError.MissingValue(arg))
      } else {
        let valueStr = args[i.contents + 1]->Option.getOr("")
        switch valueStr {
        | "info" => logLevel := Some(Logger.Info)
        | "debug" => logLevel := Some(Logger.Debug)
        | "error" => logLevel := Some(Logger.Error)
        | "json" => logMode := Some(Logger.Json)
        | "plain" => logMode := Some(Logger.Plain)
        | _ => parseError := Some(ParseError.InvalidLogLevel(valueStr))
        }
        i := i.contents + 2
      }
    } else if arg == "--lan" || arg == "-l" {
      lan := true
      i := i.contents + 1
    } else if arg == "--allow-protected-dir" {
      allowProtectedDir := true
      i := i.contents + 1
    } else if arg == "--trust-proxy" {
      trustProxy := true
      i := i.contents + 1
    } else if arg == "--auth-file" {
      if i.contents + 1 >= argsLen {
        parseError := Some(ParseError.MissingValue(arg))
      } else {
        authFile := Some(args[i.contents + 1]->Option.getOr(""))
        i := i.contents + 2
      }
    } else if arg == "--no-auth" {
      noAuth := true
      i := i.contents + 1
    } else if arg == "--no-tls" {
      noTls := true
      i := i.contents + 1
    } else if arg == "--tls" {
      tls := true
      i := i.contents + 1
    } else if arg == "--tls-cert" {
      if i.contents + 1 >= argsLen {
        parseError := Some(ParseError.MissingValue(arg))
      } else {
        tlsCert := Some(args[i.contents + 1]->Option.getOr(""))
        i := i.contents + 2
      }
    } else if arg == "--tls-key" {
      if i.contents + 1 >= argsLen {
        parseError := Some(ParseError.MissingValue(arg))
      } else {
        tlsKey := Some(args[i.contents + 1]->Option.getOr(""))
        i := i.contents + 2
      }
    } else if arg == "--rate-limit-max" {
      if i.contents + 1 >= argsLen {
        parseError := Some(ParseError.MissingValue(arg))
      } else {
        let maxStr = args[i.contents + 1]->Option.getOr("")
        let maxNum = Belt.Int.fromString(maxStr)
        switch maxNum {
        | None => parseError := Some(ParseError.InvalidRateLimit("max", 0))
        | Some(n) =>
          if n <= 0 {
            parseError := Some(ParseError.InvalidRateLimit("max", n))
          } else {
            rateLimitMax := Some(n)
          }
        }
        i := i.contents + 2
      }
    } else if arg == "--rate-limit-window" {
      if i.contents + 1 >= argsLen {
        parseError := Some(ParseError.MissingValue(arg))
      } else {
        let windowStr = args[i.contents + 1]->Option.getOr("")
        let windowNum = Belt.Int.fromString(windowStr)
        switch windowNum {
        | None => parseError := Some(ParseError.InvalidRateLimit("window", 0))
        | Some(n) =>
          if n <= 0 {
            parseError := Some(ParseError.InvalidRateLimit("window", n))
          } else {
            // Convert seconds to milliseconds
            rateLimitWindow := Some(n * 1000)
          }
        }
        i := i.contents + 2
      }
    } else if arg == "--access-log" {
      if i.contents + 1 >= argsLen {
        parseError := Some(ParseError.MissingValue(arg))
      } else {
        accessLog := Some(args[i.contents + 1]->Option.getOr(""))
        i := i.contents + 2
      }
    } else if arg == "--read-only" {
      readOnly := true
      i := i.contents + 1
    } else if (
      arg == "--rate-limit-max-requests" ||
      arg == "--rate-limit-window-ms"
    ) {
      parseError := Some(ParseError.RemovedFlag(arg))
      i := i.contents + 1
    } else if String.length(arg) > 0 && String.getUnsafe(arg, 0) == "-" {
      parseError := Some(ParseError.UnknownFlag(arg))
    } else {
      i := i.contents + 1
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

      let effectivePort = switch port.contents {
      | Some(p) => p
      | None => 8080
      }

      // Port validation.
      if effectivePort < 0 || effectivePort > 65535 {
        Error(ParseError.InvalidPort(effectivePort))
      } else {
        let effectiveIgnorePatterns = switch ignorePatterns.contents {
        | Some(patterns) => patterns
        | None => [".git", "node_modules", ".DS_Store"]
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
            authFile: authFile.contents,
            noAuth: noAuth.contents,
            noTls: noTls.contents,
            tls: effectiveTls,
            tlsCert: tlsCert.contents,
            tlsKey: tlsKey.contents,
            rateLimitMax: effectiveRateLimitMax,
            rateLimitWindow: effectiveRateLimitWindow,
            rateLimitEnabled: effectiveRateLimitEnabled,
            accessLog: accessLog.contents,
            readOnly: effectiveReadOnly,
          })
        }
      }
    }
  }
}
