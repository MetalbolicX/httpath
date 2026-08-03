// Templates.resi — interface for Ui/Templates per REQ-TEMPLATES-1..3.

type fileEntry = {
  name: string,
  isDirectory: bool,
  url: string,
}

let escapeHtml: string => string
let renderDirectoryListing: (~entries: array<fileEntry>, ~urlPath: string) => string
