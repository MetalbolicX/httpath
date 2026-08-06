// tests/unit/json_escape_test.res — unit tests for JsonEscape.escape.
// Covers each RFC 8259 §7 escape sequence, empty string, no-special-chars,
// and combined escapes.

open Test

test("backslash escaped", () => {
  assertion(
    ~message="a\\b => a\\\\b",
    ~operator="=",
    (a, b) => a == b,
    JsonEscape.escape("a\\b"),
    "a\\\\b",
  )
})

test("double-quote escaped", () => {
  assertion(
    ~message="a\"b => a\\\"b",
    ~operator="=",
    (a, b) => a == b,
    JsonEscape.escape("a\"b"),
    "a\\\"b",
  )
})

test("newline escaped", () => {
  assertion(
    ~message="a\\nb => a\\\\nb",
    ~operator="=",
    (a, b) => a == b,
    JsonEscape.escape("a\nb"),
    "a\\nb",
  )
})

test("carriage-return escaped", () => {
  assertion(
    ~message="a\\rb => a\\\\rb",
    ~operator="=",
    (a, b) => a == b,
    JsonEscape.escape("a\rb"),
    "a\\rb",
  )
})

test("tab escaped", () => {
  assertion(
    ~message="a\\tb => a\\\\tb",
    ~operator="=",
    (a, b) => a == b,
    JsonEscape.escape("a\tb"),
    "a\\tb",
  )
})

test("backspace escaped", () => {
  assertion(
    ~message="a\\bb => a\\\\bb",
    ~operator="=",
    (a, b) => a == b,
    JsonEscape.escape("a\bb"),
    "a\\bb",
  )
})

test("form-feed escaped", () => {
  assertion(
    ~message="a\\fb => a\\\\fb",
    ~operator="=",
    (a, b) => a == b,
    JsonEscape.escape("a\fb"),
    "a\\fb",
  )
})

test("empty string", () => {
  assertion(
    ~message="escape('') => ''",
    ~operator="=",
    (a, b) => a == b,
    JsonEscape.escape(""),
    "",
  )
})

test("no special chars", () => {
  assertion(
    ~message="escape('hello world') => 'hello world'",
    ~operator="=",
    (a, b) => a == b,
    JsonEscape.escape("hello world"),
    "hello world",
  )
})

test("combined escapes", () => {
  assertion(
    ~message=`a\"\\n\\r\\tb => a\\"\\\\n\\\\r\\\\tb`,
    ~operator="=",
    (a, b) => a == b,
    JsonEscape.escape("a\"\n\r\tb"),
    `a\\"\\n\\r\\tb`,
  )
})
