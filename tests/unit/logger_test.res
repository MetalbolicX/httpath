// logger_test.res — unit tests for Logger.getLevel and Logger.setLevel.
// The Logger is a mutable global singleton; every test that mutates it
// MUST restore Logger.Info before returning.

open Test

// ---------------------------------------------------------------------------
// getLevel / setLevel round-trip tests
// ---------------------------------------------------------------------------

test("setLevel(Error) / getLevel returns Error", () => {
  let restore = Logger.getLevel()
  Logger.setLevel(Logger.Error)
  assertion(
    ~message="getLevel returns Error after setLevel(Error)",
    ~operator="=",
    (a, b) => a == b,
    Logger.getLevel(),
    Logger.Error,
  )
  Logger.setLevel(restore)
})

test("setLevel(Debug) / getLevel returns Debug", () => {
  let restore = Logger.getLevel()
  Logger.setLevel(Logger.Debug)
  assertion(
    ~message="getLevel returns Debug after setLevel(Debug)",
    ~operator="=",
    (a, b) => a == b,
    Logger.getLevel(),
    Logger.Debug,
  )
  Logger.setLevel(restore)
})

test("setLevel(Info) / getLevel returns Info", () => {
  let restore = Logger.getLevel()
  Logger.setLevel(Logger.Info)
  assertion(
    ~message="getLevel returns Info after setLevel(Info)",
    ~operator="=",
    (a, b) => a == b,
    Logger.getLevel(),
    Logger.Info,
  )
  Logger.setLevel(restore)
})

// ---------------------------------------------------------------------------
// Default level is Info
// ---------------------------------------------------------------------------

test("default log level is Info", () => {
  Logger.setLevel(Logger.Info)
  assertion(
    ~message="default level is Info",
    ~operator="=",
    (a, b) => a == b,
    Logger.getLevel(),
    Logger.Info,
  )
})

// ---------------------------------------------------------------------------
// Filtering: Error level suppresses Debug messages
// ---------------------------------------------------------------------------

test("setLevel(Error) suppresses Debug log output", () => {
  let restore = Logger.getLevel()
  Logger.setLevel(Logger.Error)
  // When level is Error, Debug messages are filtered (levelOk = false).
  // The log function returns unit regardless of whether output was suppressed.
  let result = Logger.log(Logger.Debug, "this debug message should be suppressed")
  assertion(
    ~message="log(Debug) returns unit when level is Error",
    ~operator="=",
    (a, b) => a == b,
    result,
    (),
  )
  Logger.setLevel(restore)
})
