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
  | ConflictingTlsFlags(array<string>)  // conflicting args
  | ProtectedDirRefused(string, ProtectedDir.matchedRule, string)  // (requested, matchedRule, resolvedPath)
  | PublicBindRequiresLan(string)  // host that requires --lan

exception UnwritableAccessLog(string)

let toString: t => string
