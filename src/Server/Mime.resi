// Server_Mime.resi — MIME type table per REQ-MIME-1..2.

type t = {
  contentType: string,
  isText: bool,
}

let mimeFor: (~ext: string) => t
let fromPath: (~path: string) => t
