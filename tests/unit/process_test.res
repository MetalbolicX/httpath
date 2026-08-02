open Test

@module("./process_fake.mjs")
external _getLastExitCode: unit => int = "getLastExitCode"

@module("./process_fake.mjs")
external _resetExitCode: unit => unit = "resetExitCode"

test("Process.exit(0) records exit code 0 without terminating", () => {
  _resetExitCode()
  Process.exit(0)
  let code = _getLastExitCode()
  assertion(
    ~message="exit(0) records code 0",
    ~operator="=",
    (a, b) => a == b,
    code,
    0,
  )
})

test("Process.exit(1) records exit code 1 without terminating", () => {
  _resetExitCode()
  Process.exit(1)
  let code = _getLastExitCode()
  assertion(
    ~message="exit(1) records code 1",
    ~operator="=",
    (a, b) => a == b,
    code,
    1,
  )
})

test("Process.exit(42) records exit code 42", () => {
  _resetExitCode()
  Process.exit(42)
  let code = _getLastExitCode()
  assertion(
    ~message="exit(42) records code 42",
    ~operator="=",
    (a, b) => a == b,
    code,
    42,
  )
})
