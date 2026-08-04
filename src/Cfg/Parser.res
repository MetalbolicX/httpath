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
  let lan = ref(false)
  let allowProtectedDir = ref(false)
  let helpRequested = ref(false)
  let parseError = ref((None: option<ParseError.t>))
  // LAN security flags
  let authFile = ref((None: option<string>))
  let noAuth = ref(false)
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
        let levelStr = args[i.contents + 1]->Option.getOr("")
        switch levelStr {
        | "info" => logLevel := Some(Logger.Info)
        | "debug" => logLevel := Some(Logger.Debug)
        | "error" => logLevel := Some(Logger.Error)
        | _ => parseError := Some(ParseError.InvalidLogLevel(levelStr))
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
      parseError := Some(ParseError.RemovedFlag("--trust-proxy"))
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

        let effectiveListing = listing.contents && !noListing.contents
        let effectiveLogLevel = switch logLevel.contents {
        | Some(l) => l
        | None => Logger.Info
        }
        let effectiveLiveReload = !noLiveReload.contents

        // LAN security: effective values with LAN defaults
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
          enableLiveReload: effectiveLiveReload,
          restartOnChange: restartOnChange.contents,
          lan: lan.contents,
          allowProtectedDir: allowProtectedDir.contents,
          authFile: authFile.contents,
          noAuth: noAuth.contents,
          tls: tls.contents,
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
