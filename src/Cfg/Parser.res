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
        })
      }
    }
  }
}
