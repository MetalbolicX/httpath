open Test

@module("./process_fake.mjs")
external _getLastExitCode: unit => int = "getLastExitCode"

@module("./process_fake.mjs")
external _resetExitCode: unit => unit = "resetExitCode"

test("Process.exit(0) records exit code 0 without terminating", () => {
  _resetExitCode()
  Process.exit(0)
  let code = _getLastExitCode()
  assertion(~message="exit(0) records code 0", ~operator="=", (a, b) => a == b, code, 0)
})

test("Process.exit(1) records exit code 1 without terminating", () => {
  _resetExitCode()
  Process.exit(1)
  let code = _getLastExitCode()
  assertion(~message="exit(1) records code 1", ~operator="=", (a, b) => a == b, code, 1)
})

test("Process.exit(42) records exit code 42", () => {
  _resetExitCode()
  Process.exit(42)
  let code = _getLastExitCode()
  assertion(~message="exit(42) records code 42", ~operator="=", (a, b) => a == b, code, 42)
})

test("Process.argv is an array with at least 2 elements", () => {
  let args = Process.argv
  let len = Array.length(args)
  assertion(
    ~message="argv has at least 2 elements (node + script)",
    ~operator=">=",
    (a, b) => a >= b,
    len,
    2,
  )
})

test("Process.argv[0] is the node executable path", () => {
  let args = Process.argv
  let nodePath = switch args[0] {
  | Some(p) => p
  | None => ""
  }
  assertion(
    ~message="argv[0] is non-empty string",
    ~operator="=",
    (a, b) => a == b,
    nodePath != "",
    true,
  )
})

test("Process.argv[1] is the script path", () => {
  let args = Process.argv
  let scriptPath = switch args[1] {
  | Some(p) => p
  | None => ""
  }
  assertion(
    ~message="argv[1] is non-empty string",
    ~operator="=",
    (a, b) => a == b,
    scriptPath != "",
    true,
  )
})
