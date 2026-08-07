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
  | TrustProxyWithoutTrustedProxies  // --trust-proxy without --trusted-proxies
  | UnknownUser(string)  // user not found at runtime during privilege drop (plan 026)
  | SetuidFailed(string, string)  // (operation, message) during privilege drop (plan 026)

exception UnwritableAccessLog(string)

let toString: t => string
