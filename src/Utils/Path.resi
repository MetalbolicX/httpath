// Path.resi — safe path helpers for static-file handler.

let resolveSafePath: (~base: string, ~requested: string) => option<string>
let matchesPattern: (~path: string, ~patterns: array<string>) => bool
let hasSymlinkPrefix: (~base: string, ~target: string) => promise<bool>
