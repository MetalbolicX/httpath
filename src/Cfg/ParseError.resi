// ParseError.resi — typed CLI parse error variants.

type t =
  | UnknownFlag(string)
  | MissingValue(string)
  | InvalidPort(int)
  | InvalidLogLevel(string)
  | RemovedFlag(string)
  | InvalidPath(string)
  | HelpRequested
  | InvalidRateLimit(string, int)
  | ProtectedDirRefused(string, ProtectedDir.matchedRule, string)  // (requested, matchedRule, resolvedPath)

exception UnwritableAccessLog(string)

let toString: t => string
