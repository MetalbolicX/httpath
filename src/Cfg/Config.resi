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
}

// The default config — all flag defaults from the legacy parser.
let default: t
