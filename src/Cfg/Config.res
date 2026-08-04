// Config.res — CLI configuration record.
// Defaults mirror src/cli/parser.mts exactly.

type t = {
  directory: string,
  hostname: string,
  port: int,
  ignorePatterns: array<string>,
  enableDirectoryListing: bool,
  logLevel: Logger.logLevel,
  enableLiveReload: bool,
  restartOnChange: bool,
  lan: bool,
  allowProtectedDir: bool,
  trustProxy: bool,
  authFile: option<string>,
  noAuth: bool,
  tls: bool,
  tlsCert: option<string>,
  tlsKey: option<string>,
  rateLimitMax: int,
  rateLimitWindow: int,
  rateLimitEnabled: bool,
  accessLog: option<string>,
  readOnly: bool,
}

// Default Config values. Directory is resolved to absolute at parse time.
//   directory: Process.cwd()  → absolute at parse time
//   hostname: "127.0.0.1"
//   port: 8080
//   ignorePatterns: [".git", "node_modules", ".DS_Store"]
//   enableDirectoryListing: true
//   logLevel: Logger.Info
//   enableLiveReload: true
//   restartOnChange: false
//   trustProxy: removed (--trust-proxy flag emits ParseError.RemovedFlag)
//   allowProtectedDir: false
//   lan: false
let default: t = {
  directory: Process.cwd(),
  hostname: "127.0.0.1",
  port: 8080,
  ignorePatterns: [".git", "node_modules", ".DS_Store"],
  enableDirectoryListing: true,
  logLevel: Logger.Info,
  enableLiveReload: true,
  restartOnChange: false,
  lan: false,
  allowProtectedDir: false,
  trustProxy: false,
  authFile: None,
  noAuth: false,
  tls: false,
  tlsCert: None,
  tlsKey: None,
  rateLimitMax: 0,
  rateLimitWindow: 0,
  rateLimitEnabled: false,
  accessLog: None,
  readOnly: false,
}
