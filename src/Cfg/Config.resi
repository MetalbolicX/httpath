// Config.resi — CLI configuration record type.

// Defaults mirror src/cli/parser.mts exactly.
type t = {
  directory: string,
  hostname: string,
  port: int,
  ignorePatterns: array<string>,
  enableDirectoryListing: bool,
  logLevel: Logger.logLevel,
  logMode: Logger.mode,
  enableLiveReload: bool,
  restartOnChange: bool,
  lan: bool,
  allowProtectedDir: bool,
  trustProxy: bool,
  trustedProxies: array<string>,
  authFile: option<string>,
  noAuth: bool,
  noTls: bool,
  tls: bool,
  tlsCert: option<string>,
  tlsKey: option<string>,
  rateLimitMax: int,
  rateLimitWindow: int,
  rateLimitEnabled: bool,
  authMaxFailures: int,
  authLockoutMs: int,
  accessLog: option<string>,
  readOnly: bool,
  user: option<string>,   // privilege-drop target user (plan 026)
  group: option<string>,  // privilege-drop target group (plan 026)
  wsMaxPerIp: int,        // WebSocket per-IP connection cap (plan 033)
  wsMaxGlobal: int,       // WebSocket global connection cap (plan 033)
}

// The default config — all flag defaults from the legacy parser.
let default: t
