// src/Utils/JsonEscape.res — pure JSON string escaper.
// Escapes all characters that require a backslash escape in a JSON string
// literal (RFC 8259 §7). Pure ReScript, zero %raw, zero Js.Json.

let escape = (s: string): string => {
  let buf = ref("")
  let rec go = (i: int): unit => {
    if i >= String.length(s) {
      ()
    } else {
      switch String.get(s, i) {
      | Some(c) =>
        switch c {
        | "\\" => buf := buf.contents ++ "\\\\"
        | "\"" => buf := buf.contents ++ "\\\""
        | "\n" => buf := buf.contents ++ "\\n"
        | "\r" => buf := buf.contents ++ "\\r"
        | "\t" => buf := buf.contents ++ "\\t"
        | "\b" => buf := buf.contents ++ "\\b"
        | "\f" => buf := buf.contents ++ "\\f"
        | _ =>
          switch String.charCodeAt(s, i) {
          | Some(code) if code < 0x20 =>
            let hex = switch code {
            | 0 => "00"
            | 1 => "01"
            | 2 => "02"
            | 3 => "03"
            | 4 => "04"
            | 5 => "05"
            | 6 => "06"
            | 7 => "07"
            | 8 => "08"
            | 9 => "09"
            | 10 => "0a"
            | 11 => "0b"
            | 12 => "0c"
            | 13 => "0d"
            | 14 => "0e"
            | 15 => "0f"
            | 16 => "10"
            | 17 => "11"
            | 18 => "12"
            | 19 => "13"
            | 20 => "14"
            | 21 => "15"
            | 22 => "16"
            | 23 => "17"
            | 24 => "18"
            | 25 => "19"
            | 26 => "1a"
            | 27 => "1b"
            | 28 => "1c"
            | 29 => "1d"
            | 30 => "1e"
            | 31 => "1f"
            | _ => "??"
            }
            buf := buf.contents ++ "\\u00" ++ hex
          | _ => buf := buf.contents ++ c
          }
        }
      | None => ()
      }
      go(i + 1)
    }
  }
  go(0)
  buf.contents
}
