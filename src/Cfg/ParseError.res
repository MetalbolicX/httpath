// ParseError.res — typed CLI parse error variants.
// UnwritableAccessLog is an exception (raise-able); others are returned as result types.

type t =
  | UnknownFlag(string)
  | MissingValue(string)
  | InvalidPort(int)
  | InvalidLogLevel(string)
  | RemovedFlag(string)
  | InvalidPath(string)
  | HelpRequested
  | InvalidRateLimit(string, int)
  | ConflictingTlsFlags(array<string>)  // conflicting args: typically ["--no-tls", "--tls-cert", path] etc.
  | ProtectedDirRefused(string, ProtectedDir.matchedRule, string)  // (requested, matchedRule, resolvedPath)
  | PublicBindRequiresLan(string)  // host that requires --lan
  | TrustProxyWithoutTrustedProxies  // --trust-proxy without --trusted-proxies
  | UnknownUser(string)  // user not found at runtime during privilege drop (plan 026)
  | SetuidFailed(string, string)  // (operation, message) during privilege drop (plan 026)

// UnwritableAccessLog is a raise-able exception (separate from the result variant)
exception UnwritableAccessLog(string)

let toString = (e: t): string => {
  switch e {
  | UnknownFlag(flag) => `Unknown flag: ${flag}`
  | MissingValue(flag) => `Missing value for flag: ${flag}`
  | InvalidPort(port) => `Invalid port: ${Belt.Int.toString(port)}. Must be between 0 and 65535.`
  | InvalidLogLevel(level) => `Invalid log level: ${level}. Must be one of: info, debug, error.`
  | RemovedFlag(flag) => `Flag has been removed: ${flag}`
  | InvalidPath(path) => `Invalid path: ${path}`
  | HelpRequested => "Help requested"
  | InvalidRateLimit(kind, val) =>
    `Invalid rate limit ${kind}: ${Belt.Int.toString(val)}. Must be a positive integer.`
  | ConflictingTlsFlags(conflicting) =>
    let flagList = Js.Array.joinWith(" ", conflicting)
    `Conflicting TLS flags: --no-tls cannot be used together with TLS certificate/key options (${flagList}).`
  | ProtectedDirRefused(requested, rule, resolved) =>
    `httpath: refusing to serve a protected system directory.\n\n  Requested:  ${requested}\n  Resolved:   ${resolved}\n  Matched:    ${ProtectedDir.ruleToString(rule)}\n\n  Serving this directory exposes admin-privilege files over the network.\n  If this is intentional and you accept the risk, re-run with:\n\n      --allow-protected-dir\n\n  (Consider also --tls when exposing over --lan.)`
  | PublicBindRequiresLan(host) =>
    `--host ${host} requires --lan. Non-loopback binds must opt into LAN security defaults (TLS, auth, rate limiting).`
  | TrustProxyWithoutTrustedProxies =>
    `--trust-proxy requires --trusted-proxies to be set. X-Forwarded-For spoofing is only safe when the immediate TCP peer is a known proxy (e.g. nginx on the LAN).`
  | UnknownUser(user) =>
    `Unknown user: ${user}. Could not resolve user name to a uid at runtime during privilege drop.`
  | SetuidFailed(op, msg) =>
    `privilege-drop ${op} failed: ${msg}. Refusing to serve as root — a privilege drop was requested but could not complete.`
  }
}
