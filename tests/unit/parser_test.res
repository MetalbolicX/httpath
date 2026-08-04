// parser_test.res — unit tests for the CLI parser module.
// Tests cover all flag combinations, defaults, aliases, validation,
// removed flags, and help handling per REQ-CLI-1..5.

open Test

// ---------------------------------------------------------------------------
// Helper: unwrap Ok result or fail with error message
// ---------------------------------------------------------------------------

let unwrapConfig = (r: result<Config.t, ParseError.t>): Config.t => {
  switch r {
  | Ok(c) => c
  | Error(e) =>
    let msg = ParseError.toString(e)
    JsError.throwWithMessage("unwrapConfig called on Error: " ++ msg)
  }
}

// ---------------------------------------------------------------------------
// REQ-CLI-1: Default config — all flags default
// ---------------------------------------------------------------------------

test("parse([]) returns all defaults", () => {
  let result = Parser.parse([])
  switch result {
  | Error(e) =>
    let msg = ParseError.toString(e)
    JsError.throwWithMessage("Expected Ok, got Error: " ++ msg)
  | Ok(c) =>
    assertion(
      ~message="hostname is 127.0.0.1",
      ~operator="=",
      (a, b) => a == b,
      c.hostname,
      "127.0.0.1",
    )
    assertion(~message="port is 8080", ~operator="=", (a, b) => a == b, c.port, 8080)
    assertion(
      ~message="enableDirectoryListing is true",
      ~operator="=",
      (a, b) => a == b,
      c.enableDirectoryListing,
      true,
    )
    assertion(
      ~message="enableLiveReload is true",
      ~operator="=",
      (a, b) => a == b,
      c.enableLiveReload,
      true,
    )
    assertion(
      ~message="restartOnChange is false",
      ~operator="=",
      (a, b) => a == b,
      c.restartOnChange,
      false,
    )
    assertion(~message="lan is false", ~operator="=", (a, b) => a == b, c.lan, false)
    assertion(
      ~message="allowProtectedDir is false",
      ~operator="=",
      (a, b) => a == b,
      c.allowProtectedDir,
      false,
    )
    assertion(~message="logLevel is Info", ~operator="=", (a, b) => a == b, c.logLevel, Logger.Info)
    assertion(
      ~message="ignorePatterns has 3 entries",
      ~operator="=",
      (a, b) => a == b,
      Array.length(c.ignorePatterns),
      3,
    )
  }
})

// ---------------------------------------------------------------------------
// REQ-CLI-1: Explicit -d and -p flags
// ---------------------------------------------------------------------------

test("parse([\"-d\", \"/tmp\", \"-p\", \"3000\"]) sets dir and port", () => {
  let c = unwrapConfig(Parser.parse(["-d", "/tmp", "-p", "3000"]))
  assertion(~message="directory is /tmp (resolved)", ~operator="=", (a, b) => a == b, c.port, 3000)
  assertion(~message="port is 3000", ~operator="=", (a, b) => a == b, c.port, 3000)
})

test("parse([\"--dir\", \"/var/log\", \"--port\", \"9000\"]) long forms", () => {
  let c = unwrapConfig(Parser.parse(["--dir", "/var/log", "--port", "9000"]))
  assertion(~message="port is 9000", ~operator="=", (a, b) => a == b, c.port, 9000)
})

// ---------------------------------------------------------------------------
// REQ-CLI-2: enableDirectoryListing = listing && !no-listing
// ---------------------------------------------------------------------------

test("--listing sets enableDirectoryListing to true", () => {
  let c = unwrapConfig(Parser.parse(["--listing"]))
  assertion(
    ~message="enableDirectoryListing is true with --listing",
    ~operator="=",
    (a, b) => a == b,
    c.enableDirectoryListing,
    true,
  )
})

test("--no-listing sets enableDirectoryListing to false", () => {
  let c = unwrapConfig(Parser.parse(["--no-listing"]))
  assertion(
    ~message="enableDirectoryListing is false with --no-listing",
    ~operator="=",
    (a, b) => a == b,
    c.enableDirectoryListing,
    false,
  )
})

test("--listing --no-listing: no-listing wins (listing && !no-listing)", () => {
  let c = unwrapConfig(Parser.parse(["--listing", "--no-listing"]))
  assertion(
    ~message="enableDirectoryListing is false when both present",
    ~operator="=",
    (a, b) => a == b,
    c.enableDirectoryListing,
    false,
  )
})

// ---------------------------------------------------------------------------
// REQ-CLI-2: Hostname precedence (explicit --host > --lan > default)
// ---------------------------------------------------------------------------

test("--host overrides default", () => {
  let c = unwrapConfig(Parser.parse(["--host", "0.0.0.0"]))
  assertion(
    ~message="hostname is explicitly set",
    ~operator="=",
    (a, b) => a == b,
    c.hostname,
    "0.0.0.0",
  )
})

test("--lan sets hostname to 0.0.0.0", () => {
  let c = unwrapConfig(Parser.parse(["--lan"]))
  assertion(
    ~message="hostname is 0.0.0.0 with --lan",
    ~operator="=",
    (a, b) => a == b,
    c.hostname,
    "0.0.0.0",
  )
})

test("-l (alias) sets hostname to 0.0.0.0", () => {
  let c = unwrapConfig(Parser.parse(["-l"]))
  assertion(
    ~message="hostname is 0.0.0.0 with -l",
    ~operator="=",
    (a, b) => a == b,
    c.hostname,
    "0.0.0.0",
  )
})

test("--host overrides --lan (explicit host wins)", () => {
  let c = unwrapConfig(Parser.parse(["--host", "192.168.1.1", "--lan"]))
  assertion(
    ~message="explicit --host wins over --lan",
    ~operator="=",
    (a, b) => a == b,
    c.hostname,
    "192.168.1.1",
  )
})

// ---------------------------------------------------------------------------
// REQ-CLI-1: --restart-on-change / -r
// ---------------------------------------------------------------------------

test("-r sets restartOnChange to true", () => {
  let c = unwrapConfig(Parser.parse(["-r"]))
  assertion(
    ~message="restartOnChange is true with -r",
    ~operator="=",
    (a, b) => a == b,
    c.restartOnChange,
    true,
  )
})

test("--restart-on-change sets restartOnChange to true", () => {
  let c = unwrapConfig(Parser.parse(["--restart-on-change"]))
  assertion(
    ~message="restartOnChange is true with --restart-on-change",
    ~operator="=",
    (a, b) => a == b,
    c.restartOnChange,
    true,
  )
})

test("--no-live-reload sets enableLiveReload to false", () => {
  let c = unwrapConfig(Parser.parse(["--no-live-reload"]))
  assertion(
    ~message="enableLiveReload is false with --no-live-reload",
    ~operator="=",
    (a, b) => a == b,
    c.enableLiveReload,
    false,
  )
})

// ---------------------------------------------------------------------------
// REQ-CLI-3: Port validation
// ---------------------------------------------------------------------------

test("port 0 is valid (ephemeral)", () => {
  let c = unwrapConfig(Parser.parse(["--port", "0"]))
  assertion(~message="port 0 is valid", ~operator="=", (a, b) => a == b, c.port, 0)
})

test("port 65535 is valid", () => {
  let c = unwrapConfig(Parser.parse(["--port", "65535"]))
  assertion(~message="port 65535 is valid", ~operator="=", (a, b) => a == b, c.port, 65535)
})

test("port 65536 is invalid", () => {
  let r = Parser.parse(["--port", "65536"])
  switch r {
  | Ok(_) =>
    assertion(~message="65536 should be Error", ~operator="=", (a, b) => a == b, false, true)
  | Error(ParseError.InvalidPort(p)) =>
    assertion(~message="InvalidPort error returned", ~operator="=", (a, b) => a == b, p, 65536)
  | Error(e) =>
    let msg = ParseError.toString(e)
    JsError.throwWithMessage("Expected InvalidPort, got: " ++ msg)
  }
})

test("negative port is invalid", () => {
  let r = Parser.parse(["--port", "-1"])
  switch r {
  | Ok(_) => assertion(~message="-1 should be Error", ~operator="=", (a, b) => a == b, false, true)
  | Error(ParseError.InvalidPort(_)) =>
    assertion(
      ~message="InvalidPort error returned for -1",
      ~operator="=",
      (a, b) => a == b,
      true,
      true,
    )
  | Error(e) =>
    let msg = ParseError.toString(e)
    JsError.throwWithMessage("Expected InvalidPort, got: " ++ msg)
  }
})

test("non-numeric port is invalid", () => {
  let r = Parser.parse(["--port", "abc"])
  switch r {
  | Ok(_) => assertion(~message="abc should be Error", ~operator="=", (a, b) => a == b, false, true)
  | Error(ParseError.InvalidPort(0)) =>
    assertion(
      ~message="InvalidPort(0) returned for non-numeric",
      ~operator="=",
      (a, b) => a == b,
      true,
      true,
    )
  | Error(e) =>
    let msg = ParseError.toString(e)
    JsError.throwWithMessage("Expected InvalidPort, got: " ++ msg)
  }
})

// ---------------------------------------------------------------------------
// REQ-CLI-3: Log level validation
// ---------------------------------------------------------------------------

test("--log info returns Info", () => {
  let c = unwrapConfig(Parser.parse(["--log", "info"]))
  assertion(~message="logLevel is Info", ~operator="=", (a, b) => a == b, c.logLevel, Logger.Info)
})

test("--log debug returns Debug", () => {
  let c = unwrapConfig(Parser.parse(["--log", "debug"]))
  assertion(~message="logLevel is Debug", ~operator="=", (a, b) => a == b, c.logLevel, Logger.Debug)
})

test("--log error returns Error", () => {
  let c = unwrapConfig(Parser.parse(["--log", "error"]))
  assertion(~message="logLevel is Error", ~operator="=", (a, b) => a == b, c.logLevel, Logger.Error)
})

test("--log trace returns InvalidLogLevel error", () => {
  let r = Parser.parse(["--log", "trace"])
  switch r {
  | Ok(_) =>
    assertion(~message="trace should be Error", ~operator="=", (a, b) => a == b, false, true)
  | Error(ParseError.InvalidLogLevel(s)) =>
    assertion(~message="InvalidLogLevel(\"trace\")", ~operator="=", (a, b) => a == b, s, "trace")
  | Error(e) =>
    let msg = ParseError.toString(e)
    JsError.throwWithMessage("Expected InvalidLogLevel, got: " ++ msg)
  }
})

// ---------------------------------------------------------------------------
// REQ-CLI-3: Missing value
// ---------------------------------------------------------------------------

test("--dir with no value returns MissingValue", () => {
  let r = Parser.parse(["--dir"])
  switch r {
  | Ok(_) =>
    assertion(~message="--dir alone should be Error", ~operator="=", (a, b) => a == b, false, true)
  | Error(ParseError.MissingValue(flag)) =>
    assertion(~message="MissingValue for --dir", ~operator="=", (a, b) => a == b, flag, "--dir")
  | Error(e) =>
    let msg = ParseError.toString(e)
    JsError.throwWithMessage("Expected MissingValue, got: " ++ msg)
  }
})

test("--port with no value returns MissingValue", () => {
  let r = Parser.parse(["--port"])
  switch r {
  | Ok(_) =>
    assertion(~message="--port alone should be Error", ~operator="=", (a, b) => a == b, false, true)
  | Error(ParseError.MissingValue(flag)) =>
    assertion(~message="MissingValue for --port", ~operator="=", (a, b) => a == b, flag, "--port")
  | Error(e) =>
    let msg = ParseError.toString(e)
    JsError.throwWithMessage("Expected MissingValue, got: " ++ msg)
  }
})

// ---------------------------------------------------------------------------
// REQ-CLI-3: Unknown flags
// ---------------------------------------------------------------------------

test("unknown flag returns UnknownFlag", () => {
  let r = Parser.parse(["--unknown-flag"])
  switch r {
  | Ok(_) =>
    assertion(
      ~message="--unknown-flag should be Error",
      ~operator="=",
      (a, b) => a == b,
      false,
      true,
    )
  | Error(ParseError.UnknownFlag(flag)) =>
    assertion(
      ~message="UnknownFlag for --unknown-flag",
      ~operator="=",
      (a, b) => a == b,
      flag,
      "--unknown-flag",
    )
  | Error(e) =>
    let msg = ParseError.toString(e)
    JsError.throwWithMessage("Expected UnknownFlag, got: " ++ msg)
  }
})

test("unknown short flag -z returns UnknownFlag", () => {
  let r = Parser.parse(["-z"])
  switch r {
  | Ok(_) => assertion(~message="-z should be Error", ~operator="=", (a, b) => a == b, false, true)
  | Error(ParseError.UnknownFlag(flag)) =>
    assertion(~message="UnknownFlag for -z", ~operator="=", (a, b) => a == b, flag, "-z")
  | Error(e) =>
    let msg = ParseError.toString(e)
    JsError.throwWithMessage("Expected UnknownFlag, got: " ++ msg)
  }
})

// ---------------------------------------------------------------------------
// REQ-CLI-3: Removed flags
// ---------------------------------------------------------------------------

test("--trust-proxy returns RemovedFlag error", () => {
  let r = Parser.parse(["--trust-proxy"])
  switch r {
  | Ok(_) =>
    assertion(
      ~message="--trust-proxy should be Error",
      ~operator="=",
      (a, b) => a == b,
      false,
      true,
    )
  | Error(ParseError.RemovedFlag(flag)) =>
    assertion(
      ~message="RemovedFlag for --trust-proxy",
      ~operator="=",
      (a, b) => a == b,
      flag,
      "--trust-proxy",
    )
  | Error(e) =>
    let msg = ParseError.toString(e)
    JsError.throwWithMessage("Expected RemovedFlag, got: " ++ msg)
  }
})

test("--rate-limit-max-requests returns RemovedFlag error", () => {
  let r = Parser.parse(["--rate-limit-max-requests", "10"])
  switch r {
  | Ok(_) =>
    assertion(
      ~message="--rate-limit-max-requests should be Error",
      ~operator="=",
      (a, b) => a == b,
      false,
      true,
    )
  | Error(ParseError.RemovedFlag(flag)) =>
    assertion(
      ~message="RemovedFlag for --rate-limit-max-requests",
      ~operator="=",
      (a, b) => a == b,
      flag,
      "--rate-limit-max-requests",
    )
  | Error(e) =>
    let msg = ParseError.toString(e)
    JsError.throwWithMessage("Expected RemovedFlag, got: " ++ msg)
  }
})

test("--rate-limit-window-ms returns RemovedFlag error", () => {
  let r = Parser.parse(["--rate-limit-window-ms", "60000"])
  switch r {
  | Ok(_) =>
    assertion(
      ~message="--rate-limit-window-ms should be Error",
      ~operator="=",
      (a, b) => a == b,
      false,
      true,
    )
  | Error(ParseError.RemovedFlag(flag)) =>
    assertion(
      ~message="RemovedFlag for --rate-limit-window-ms",
      ~operator="=",
      (a, b) => a == b,
      flag,
      "--rate-limit-window-ms",
    )
  | Error(e) =>
    let msg = ParseError.toString(e)
    JsError.throwWithMessage("Expected RemovedFlag, got: " ++ msg)
  }
})

// ---------------------------------------------------------------------------
// REQ-CLI-4: Help
// ---------------------------------------------------------------------------

test("--help returns HelpRequested error", () => {
  let r = Parser.parse(["--help"])
  switch r {
  | Ok(_) =>
    assertion(
      ~message="--help should return HelpRequested",
      ~operator="=",
      (a, b) => a == b,
      false,
      true,
    )
  | Error(ParseError.HelpRequested) =>
    assertion(
      ~message="HelpRequested returned for --help",
      ~operator="=",
      (a, b) => a == b,
      true,
      true,
    )
  | Error(e) =>
    let msg = ParseError.toString(e)
    JsError.throwWithMessage("Expected HelpRequested, got: " ++ msg)
  }
})

test("-h returns HelpRequested error", () => {
  let r = Parser.parse(["-h"])
  switch r {
  | Ok(_) =>
    assertion(
      ~message="-h should return HelpRequested",
      ~operator="=",
      (a, b) => a == b,
      false,
      true,
    )
  | Error(ParseError.HelpRequested) =>
    assertion(~message="HelpRequested returned for -h", ~operator="=", (a, b) => a == b, true, true)
  | Error(e) =>
    let msg = ParseError.toString(e)
    JsError.throwWithMessage("Expected HelpRequested, got: " ++ msg)
  }
})

// ---------------------------------------------------------------------------
// REQ-CLI-1: --ignore patterns
// ---------------------------------------------------------------------------

test("--ignore with single pattern", () => {
  let c = unwrapConfig(Parser.parse(["--ignore", "*.log"]))
  assertion(
    ~message="ignorePatterns has 1 entry",
    ~operator="=",
    (a, b) => a == b,
    Array.length(c.ignorePatterns),
    1,
  )
  assertion(
    ~message="first pattern is *.log",
    ~operator="=",
    (a, b) => a == b,
    c.ignorePatterns[0]->Option.getOr(""),
    "*.log",
  )
})

test("--ignore with comma-separated patterns", () => {
  let c = unwrapConfig(Parser.parse(["--ignore", "*.log,temp/,*.tmp"]))
  assertion(
    ~message="ignorePatterns has 3 entries",
    ~operator="=",
    (a, b) => a == b,
    Array.length(c.ignorePatterns),
    3,
  )
})

test("-i with patterns", () => {
  let c = unwrapConfig(Parser.parse(["-i", "*.bak"]))
  assertion(
    ~message="ignorePatterns has 1 entry via -i",
    ~operator="=",
    (a, b) => a == b,
    Array.length(c.ignorePatterns),
    1,
  )
})

// ---------------------------------------------------------------------------
// REQ-CLI-5: Determinism — same argv always returns same result
// ---------------------------------------------------------------------------

test("parse is deterministic (same args => same config)", () => {
  let args = ["--dir", "/tmp", "-p", "3000", "--lan"]
  let r1 = Parser.parse(args)
  let r2 = Parser.parse(args)
  switch (r1, r2) {
  | (Ok(c1), Ok(c2)) =>
    assertion(
      ~message="same args produce same port",
      ~operator="=",
      (a, b) => a == b,
      c1.port,
      c2.port,
    )
    assertion(
      ~message="same args produce same hostname",
      ~operator="=",
      (a, b) => a == b,
      c1.hostname,
      c2.hostname,
    )
  | _ => JsError.throwWithMessage("Both results should be Ok for deterministic test")
  }
})

// ---------------------------------------------------------------------------
// REQ-CLI-1: --allow-protected-dir
// ---------------------------------------------------------------------------

test("--allow-protected-dir sets allowProtectedDir to true", () => {
  let c = unwrapConfig(Parser.parse(["--allow-protected-dir"]))
  assertion(
    ~message="allowProtectedDir is true",
    ~operator="=",
    (a, b) => a == b,
    c.allowProtectedDir,
    true,
  )
})

// ---------------------------------------------------------------------------
// REQ-CLI-1: Non-flag arguments are skipped (ignored)
// ---------------------------------------------------------------------------

test("non-flag arguments are skipped", () => {
  let c = unwrapConfig(Parser.parse(["some-file.txt", "--port", "4000", "another.html"]))
  assertion(
    ~message="port is parsed despite non-flag args",
    ~operator="=",
    (a, b) => a == b,
    c.port,
    4000,
  )
})
