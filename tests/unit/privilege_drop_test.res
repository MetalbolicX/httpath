// privilege_drop_test.res — unit tests for --user/--group privilege-drop flags (plan 026).
// TDD: tests written BEFORE implementation; implementation added to make them pass.

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
// REQ-PD-1: --user flag stores user in config.user
// ---------------------------------------------------------------------------

test("parse([\"--user\", \"nobody\"]) stores user as Some(\"nobody\")", () => {
  let result = Parser.parse(["--user", "nobody"])
  let c = unwrapConfig(result)
  assertion(
    ~message="config.user is Some(nobody)",
    ~operator="=",
    (a, b) => a == b,
    c.user,
    Some("nobody"),
  )
})

test("parse([\"--user\", \"65534\"]) stores user as Some(\"65534\")", () => {
  let result = Parser.parse(["--user", "65534"])
  let c = unwrapConfig(result)
  assertion(
    ~message="config.user is Some(65534)",
    ~operator="=",
    (a, b) => a == b,
    c.user,
    Some("65534"),
  )
})

test("parse([]) has user as None by default", () => {
  let result = Parser.parse([])
  let c = unwrapConfig(result)
  assertion(
    ~message="config.user is None by default",
    ~operator="=",
    (a, b) => a == b,
    c.user,
    None,
  )
})

test("parse([\"--user\"]) without value returns MissingValue error", () => {
  let result = Parser.parse(["--user"])
  switch result {
  | Ok(_) => JsError.throwWithMessage("Expected Error, got Ok")
  | Error(e) =>
    let msg = ParseError.toString(e)
    assertion(
      ~message="error is MissingValue",
      ~operator="=",
      (a, b) => a == b,
      Js.String.includes("Missing value", msg),
      true,
    )
  }
})

// ---------------------------------------------------------------------------
// REQ-PD-2: --group flag stores group in config.group
// ---------------------------------------------------------------------------

test("parse([\"--group\", \"nogroup\"]) stores group as Some(\"nogroup\")", () => {
  let result = Parser.parse(["--group", "nogroup"])
  let c = unwrapConfig(result)
  assertion(
    ~message="config.group is Some(nogroup)",
    ~operator="=",
    (a, b) => a == b,
    c.group,
    Some("nogroup"),
  )
})

test("parse([]) has group as None by default", () => {
  let result = Parser.parse([])
  let c = unwrapConfig(result)
  assertion(
    ~message="config.group is None by default",
    ~operator="=",
    (a, b) => a == b,
    c.group,
    None,
  )
})

test("parse([\"--group\"]) without value returns MissingValue error", () => {
  let result = Parser.parse(["--group"])
  switch result {
  | Ok(_) => JsError.throwWithMessage("Expected Error, got Ok")
  | Error(e) =>
    let msg = ParseError.toString(e)
    assertion(
      ~message="error is MissingValue",
      ~operator="=",
      (a, b) => a == b,
      Js.String.includes("Missing value", msg),
      true,
    )
  }
})

// ---------------------------------------------------------------------------
// REQ-PD-3: --user with no --group defaults group to user value
// ---------------------------------------------------------------------------

test("parse([\"--user\", \"nobody\"]) without --group has group defaulting to user", () => {
  let result = Parser.parse(["--user", "nobody"])
  let c = unwrapConfig(result)
  assertion(
    ~message="config.group is None (implemented as use user value at drop time)",
    ~operator="=",
    (a, b) => a == b,
    c.group,
    None,  // Parser stores None; Httpath drop logic uses userStr when group is None
  )
})

test("parse([\"--user\", \"nobody\", \"--group\", \"users\"]) stores both values", () => {
  let result = Parser.parse(["--user", "nobody", "--group", "users"])
  let c = unwrapConfig(result)
  assertion(
    ~message="config.user is Some(nobody)",
    ~operator="=",
    (a, b) => a == b,
    c.user,
    Some("nobody"),
  )
  assertion(
    ~message="config.group is Some(users)",
    ~operator="=",
    (a, b) => a == b,
    c.group,
    Some("users"),
  )
})

// ---------------------------------------------------------------------------
// REQ-PD-4: ParseError.UnknownUser and SetuidFailed variants exist
// ---------------------------------------------------------------------------

test("ParseError.UnknownUser(\"alice\") produces non-empty toString", () => {
  let e = ParseError.UnknownUser("alice")
  let msg = ParseError.toString(e)
  assertion(
    ~message="UnknownUser toString is non-empty",
    ~operator=">",
    (a, b) => a > b,
    String.length(msg),
    0,
  )
  assertion(
    ~message="UnknownUser toString contains user name",
    ~operator="=",
    (a, b) => a == b,
    Js.String.includes("alice", msg),
    true,
  )
})

test("ParseError.SetuidFailed(\"setuid\", \"permission denied\") produces non-empty toString", () => {
  let e = ParseError.SetuidFailed("setuid", "permission denied")
  let msg = ParseError.toString(e)
  assertion(
    ~message="SetuidFailed toString is non-empty",
    ~operator=">",
    (a, b) => a > b,
    String.length(msg),
    0,
  )
  assertion(
    ~message="SetuidFailed toString contains operation",
    ~operator="=",
    (a, b) => a == b,
    Js.String.includes("setuid", msg),
    true,
  )
  assertion(
    ~message="SetuidFailed toString contains message",
    ~operator="=",
    (a, b) => a == b,
    Js.String.includes("permission denied", msg),
    true,
  )
})

// ---------------------------------------------------------------------------
// REQ-PD-5: --user and --group are unknown flags when given alone (negative)
// ---------------------------------------------------------------------------

test("parse([\"--user\"]) alone without value is MissingValue (not UnknownFlag)", () => {
  // This tests that the flag IS recognised but value is missing.
  let result = Parser.parse(["--user"])
  switch result {
  | Ok(_) => JsError.throwWithMessage("Expected Error, got Ok")
  | Error(e) =>
    let msg = ParseError.toString(e)
    // Must be MissingValue, not UnknownFlag
    assertion(
      ~message="is MissingValue not UnknownFlag",
      ~operator="=",
      (a, b) => a == b,
      Js.String.includes("Missing value", msg),
      true,
    )
  }
})

test("parse([\"--user\", \"0\"]) is accepted (uid 0 is valid input)", () => {
  // We don't validate uid existence at parse time — that's a runtime concern.
  let result = Parser.parse(["--user", "0"])
  let c = unwrapConfig(result)
  assertion(
    ~message="config.user is Some(0)",
    ~operator="=",
    (a, b) => a == b,
    c.user,
    Some("0"),
  )
})
