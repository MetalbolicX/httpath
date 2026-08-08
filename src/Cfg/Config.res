// Config.res — CLI configuration record.
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
  allowCidrs: array<string>,
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

// Default Config values. Directory is resolved to absolute at parse time.
//   directory: Process.cwd()  → absolute at parse time
//   hostname: "127.0.0.1"
//   port: 8080
//   ignorePatterns: [".git", "node_modules", ".DS_Store"]
//   enableDirectoryListing: true
//   logLevel: Logger.Info
//   logMode: Logger.Json
//   enableLiveReload: true
//   restartOnChange: false
//   trustProxy: false  // --trust-proxy gate requires --trusted-proxies
//   allowProtectedDir: false
//   lan: false
let default: t = {
  directory: Process.cwd(),
  hostname: "127.0.0.1",
  port: 8080,
  ignorePatterns: [".git", "node_modules", ".DS_Store", ".env", ".httpath-auth", ".npmrc"],
  enableDirectoryListing: true,
  logLevel: Logger.Info,
  logMode: Logger.Json,
  enableLiveReload: true,
  restartOnChange: false,
  lan: false,
  allowProtectedDir: false,
  trustProxy: false,
  trustedProxies: [],
  allowCidrs: [],
  authFile: None,
  noAuth: false,
  noTls: false,
  tls: false,
  tlsCert: None,
  tlsKey: None,
  rateLimitMax: 0,
  rateLimitWindow: 0,
  rateLimitEnabled: false,
  authMaxFailures: 5,
  authLockoutMs: 30000,
  accessLog: None,
  readOnly: false,
  user: None,
  group: None,
  wsMaxPerIp: 2,
  wsMaxGlobal: 3,
}
