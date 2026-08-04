// Config.resi — CLI configuration record type.

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

// The default config — all flag defaults from the legacy parser.
let default: t
