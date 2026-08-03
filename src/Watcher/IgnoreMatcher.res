// IgnoreMatcher.res — case-fold + path-normalize substring/glob matcher.
// Used by Monitor to filter file events before Rules.decide (REQ-FW-3).

// Case-fold + path-normalize before Rules.decide.
// Matches legacy matchesPattern: case-insensitive substring/glob per REQ-FW-3.
let matchesIgnorePattern = (path: string, patterns: array<string>): bool => {
  let lower = String.toLowerCase(path)
  patterns->Array.some(p => {
    let pl = String.toLowerCase(p)
    if Js.String.includes("*", pl) {
      // Remove ALL asterisks by iterating and collecting non-* chars.
      let rec go = (s: string, i: int, acc: string): string => {
        if i >= String.length(s) {
          acc
        } else {
          switch String.get(s, i) {
          | Some(c) =>
            let acc2 = if c == "*" {
              acc
            } else {
              acc ++ String.make(c)
            }
            go(s, i + 1, acc2)
          | None => acc
          }
        }
      }
      let globRe = go(pl, 0, "")
      // Js.String.startsWith/endsWith take (searchString, thisString).
      let startsStar = Js.String.startsWith("*", p)
      let endsStar = Js.String.endsWith("*", p)
      if startsStar && endsStar {
        // *foo* — path contains pattern core
        Js.String.includes(globRe, lower)
      } else if startsStar {
        // *foo — path ends with pattern core
        Js.String.endsWith(globRe, lower)
      } else if endsStar {
        // foo* — path starts with pattern core
        Js.String.startsWith(globRe, lower)
      } else {
        lower == pl
      }
    } else {
      // Exact substring match: pattern is in path
      Js.String.includes(pl, lower)
    }
  })
}
