// Server_Mime.res — fixed MIME type table per REQ-MIME-2.
// Provides mimeFor and fromPath helpers.

// ---------------------------------------------------------------------------
// Type and fixed table
// ---------------------------------------------------------------------------

type t = {
  contentType: string,
  isText: bool,
}

type entry = (string, string, bool)

// Fixed MIME table per REQ-MIME-2: html/htm, css, js/mjs, json, txt, svg,
// png, jpg/jpeg, gif, webp, ico, wasm, map. Unknown → application/octet-stream.
let mimeTable: array<entry> = [
  ("html", "text/html", true),
  ("htm", "text/html", true),
  ("css", "text/css", true),
  ("js", "text/javascript", true),
  ("mjs", "text/javascript", true),
  ("json", "application/json", false),
  ("txt", "text/plain", true),
  ("svg", "image/svg+xml", false),
  ("png", "image/png", false),
  ("jpg", "image/jpeg", false),
  ("jpeg", "image/jpeg", false),
  ("gif", "image/gif", false),
  ("webp", "image/webp", false),
  ("ico", "image/x-icon", false),
  ("wasm", "application/wasm", false),
  ("map", "application/json", false),
]

let lookupExt = (ext: string): option<t> => {
  let lower = String.toLowerCase(ext)
  mimeTable
  ->Array.find(entry => {
    let (e, _, _) = entry
    e == lower
  })
  ->Option.map(entry => {
    let (_, ct, isTxt) = entry
    {contentType: ct, isText: isTxt}
  })
}

// ---------------------------------------------------------------------------
// REQ-MIME-1: mimeFor — returns MIME type for extension (no leading dot)
// ---------------------------------------------------------------------------

let mimeFor = (~ext: string): t => {
  switch lookupExt(ext) {
  | Some(m) => m
  | None => {contentType: "application/octet-stream", isText: false}
  }
}

// ---------------------------------------------------------------------------
// REQ-MIME-1: fromPath — extracts extension and returns MIME type
// ---------------------------------------------------------------------------

let fromPath = (~path: string): t => {
  // Use Node_Path.extname to extract extension
  let raw = Node_Path.extname(path)
  // Strip leading dot if present using String.get which returns option<char>
  let ext = switch String.get(raw, 0) {
  | Some(c) =>
    if c == "." {
      String.slice(raw, ~start=1, ~end=String.length(raw))
    } else {
      raw
    }
  | None => raw
  }
  mimeFor(~ext)
}
