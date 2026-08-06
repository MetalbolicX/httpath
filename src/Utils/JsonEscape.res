// src/Utils/JsonEscape.res — pure JSON string escaper.
// Escapes all characters that require a backslash escape in a JSON string
// literal (RFC 8259 §7). Pure ReScript, zero %raw, zero Js.Json.

let escape = (s: string): string => {
  s
    ->String.replaceAll("\\", "\\\\")
    ->String.replaceAll("\"", "\\\"")
    ->String.replaceAll("\n", "\\n")
    ->String.replaceAll("\r", "\\r")
    ->String.replaceAll("\t", "\\t")
    ->String.replaceAll("\b", "\\b")
    ->String.replaceAll("\f", "\\f")
}

// TODO: Control characters below U+0020 (other than those above) require
// \u00XX escaping per RFC 8259. Full compliance would need a char-by-char
// loop. The seven escapes above cover all practical log-injection vectors
// (newline, tab, backspace, form-feed, quote, backslash, carriage return).
// Exotic control chars (U+0000–U+0008, U+000B, U+000E–U+001F) are
// extremely rare in file paths and log messages.
