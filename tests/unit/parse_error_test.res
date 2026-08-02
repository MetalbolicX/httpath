// parse_error_test.res — unit tests for ParseError module.

open Test

// ---------------------------------------------------------------------------
// Test: toString for each variant
// ---------------------------------------------------------------------------

test("UnknownFlag.toString formats correctly", () => {
  let msg = ParseError.UnknownFlag("--foo")
  let s = ParseError.toString(msg)
  assertion(
    ~message="toString returns Unknown flag format",
    ~operator="=",
    (a, b) => a == b,
    s,
    "Unknown flag: --foo",
  )
})

test("MissingValue.toString formats correctly", () => {
  let msg = ParseError.MissingValue("-d")
  let s = ParseError.toString(msg)
  assertion(
    ~message="toString returns Missing value format",
    ~operator="=",
    (a, b) => a == b,
    s,
    "Missing value for flag: -d",
  )
})

test("InvalidPort.toString formats correctly", () => {
  let msg = ParseError.InvalidPort(99999)
  let s = ParseError.toString(msg)
  assertion(
    ~message="toString returns Invalid port format with port number",
    ~operator="=",
    (a, b) => a == b,
    s,
    "Invalid port: 99999. Must be between 0 and 65535.",
  )
})

test("InvalidPort.toString works for negative port", () => {
  let msg = ParseError.InvalidPort(-1)
  let s = ParseError.toString(msg)
  assertion(
    ~message="toString handles negative port",
    ~operator="=",
    (a, b) => a == b,
    String.includes(s, "Invalid port"),
    true,
  )
})

test("InvalidLogLevel.toString formats correctly", () => {
  let msg = ParseError.InvalidLogLevel("trace")
  let s = ParseError.toString(msg)
  assertion(
    ~message="toString returns Invalid log level format",
    ~operator="=",
    (a, b) => a == b,
    s,
    "Invalid log level: trace. Must be one of: info, debug, error.",
  )
})

test("RemovedFlag.toString formats correctly", () => {
  let msg = ParseError.RemovedFlag("--trust-proxy")
  let s = ParseError.toString(msg)
  assertion(
    ~message="toString returns Removed flag format",
    ~operator="=",
    (a, b) => a == b,
    s,
    "Flag has been removed: --trust-proxy",
  )
})

test("InvalidPath.toString formats correctly", () => {
  let msg = ParseError.InvalidPath("/nonexistent/dir")
  let s = ParseError.toString(msg)
  assertion(
    ~message="toString returns Invalid path format",
    ~operator="=",
    (a, b) => a == b,
    s,
    "Invalid path: /nonexistent/dir",
  )
})

test("HelpRequested.toString returns Help requested", () => {
  let msg = ParseError.HelpRequested
  let s = ParseError.toString(msg)
  assertion(
    ~message="toString returns 'Help requested'",
    ~operator="=",
    (a, b) => a == b,
    s,
    "Help requested",
  )
})

// ---------------------------------------------------------------------------
// Test: all variants are distinguishable
// ---------------------------------------------------------------------------

test("each variant produces a distinct string", () => {
  let s1 = ParseError.toString(ParseError.UnknownFlag("x"))
  let s2 = ParseError.toString(ParseError.MissingValue("x"))
  let s3 = ParseError.toString(ParseError.InvalidPort(0))
  let s4 = ParseError.toString(ParseError.InvalidLogLevel("x"))
  let s5 = ParseError.toString(ParseError.RemovedFlag("x"))
  let s6 = ParseError.toString(ParseError.InvalidPath("x"))
  let s7 = ParseError.toString(ParseError.HelpRequested)
  let allDistinct =
    s1 != s2 && s1 != s3 && s1 != s4 && s1 != s5 && s1 != s6 && s1 != s7 &&
    s2 != s3 && s2 != s4 && s2 != s5 && s2 != s6 && s2 != s7 &&
    s3 != s4 && s3 != s5 && s3 != s6 && s3 != s7 &&
    s4 != s5 && s4 != s6 && s4 != s7 &&
    s5 != s6 && s5 != s7 &&
    s6 != s7
  assertion(
    ~message="all 7 variants produce distinct strings",
    ~operator="=",
    (a, b) => a == b,
    allDistinct,
    true,
  )
})
