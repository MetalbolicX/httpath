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

test("NUL control escaped", () => {
  assertion(
    ~message="U+0000 => \\u0000",
    ~operator="=",
    (a, b) => a == b,
    JsonEscape.escape("a" ++ "\u0000" ++ "b"),
    "a\\u0000b",
  )
})

test("C0 controls 0x01-0x08 escaped", () => {
  assertion(
    ~message="U+0001..U+0007 => \\u0001..\\u0007; U+0008 => \\b (already-special short form)",
    ~operator="=",
    (a, b) => a == b,
    JsonEscape.escape("\u0001\u0002\u0003\u0004\u0005\u0006\u0007\u0008"),
    "\\u0001\\u0002\\u0003\\u0004\\u0005\\u0006\\u0007\\b",
  )
})

test("VT (U+000B) escaped", () => {
  assertion(
    ~message="U+000B => \\u000b",
    ~operator="=",
    (a, b) => a == b,
    JsonEscape.escape("a" ++ "\u000b" ++ "b"),
    "a\\u000bb",
  )
})

test("C0 controls 0x0C-0x1F escaped", () => {
  // 0x0C=FF (already special), 0x0D=CR (already special), 0x0E=SO,
  // 0x0F=SI, 0x10=DC1..0x1F=US. BEL (0x07) and BS (0x08) already covered.
  assertion(
    ~message="U+000E..U+001F => \\u000e..\\u001f",
    ~operator="=",
    (a, b) => a == b,
    JsonEscape.escape("\u000e\u000f\u0010\u0011\u0012\u0013\u0014\u0015\u0016\u0017\u0018\u0019\u001a\u001b\u001c\u001d\u001e\u001f"),
    "\\u000e\\u000f\\u0010\\u0011\\u0012\\u0013\\u0014\\u0015\\u0016\\u0017\\u0018\\u0019\\u001a\\u001b\\u001c\\u001d\\u001e\\u001f",
  )
})

test("already-special chars keep short escapes", () => {
  // Input runtime chars: a, \, LF, CR, TAB, BS, b, FF, f (9 chars).
  // Expected JSON-escaped output: a, \, \, \, n, \, r, \, t, \, b, b, \, f, f (15 chars).
  // This guards against promoting already-special chars to \u00XX form.
  let input = "a\\\n\r\t\bb\ff"
  assertion(
    ~message="\\n => \\n (not \\u000a), \\r => \\r, etc.",
    ~operator="=",
    (a, b) => a == b,
    JsonEscape.escape(input),
    "a\\\\\\n\\r\\t\\bb\\ff",
  )
})

test("mixed printable, controls, and special escapes", () => {
  assertion(
    ~message=`hello\\u0000world\\n`,
    ~operator="=",
    (a, b) => a == b,
    JsonEscape.escape("hello" ++ "\u0000" ++ "world\n"),
    "hello\\u0000world\\n",
  )
})
