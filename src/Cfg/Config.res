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
}

// Mirrors DEFAULT_CONFIG in src/cli/parser.mts:
//   directory: Deno.cwd()  → absolute at parse time
//   hostname: "127.0.0.1"
//   port: 8080
//   ignorePatterns: [".git", "node_modules", ".DS_Store"]
//   enableDirectoryListing: false
//   logLevel: "info"
//   enableLiveReload: true
//   restartOnChange: false
//   trustProxy: false         ← removed from Config
//   allowProtectedDir: false
//   lan: false
let default: t = {
  directory: Process.cwd(),
  hostname: "127.0.0.1",
  port: 8080,
  ignorePatterns: [".git", "node_modules", ".DS_Store"],
  enableDirectoryListing: false,
  logLevel: Logger.Info,
  enableLiveReload: true,
  restartOnChange: false,
  lan: false,
  allowProtectedDir: false,
}
