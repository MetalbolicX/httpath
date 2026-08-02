// config_test.res — unit tests for Config module.

open Test

// ---------------------------------------------------------------------------
// Test: default values match legacy parser EXACTLY
// ---------------------------------------------------------------------------

test("Config.default has correct directory", () => {
  let dir = Config.default.directory
  // directory must be non-empty string (absolute path from cwd)
  assertion(
    ~message="directory is a non-empty string",
    ~operator="=",
    (a, b) => a == b,
    String.length(dir) > 0,
    true,
  )
})

test("Config.default hostname is 127.0.0.1", () => {
  assertion(
    ~message="hostname defaults to 127.0.0.1",
    ~operator="=",
    (a, b) => a == b,
    Config.default.hostname,
    "127.0.0.1",
  )
})

test("Config.default port is 8080", () => {
  assertion(
    ~message="port defaults to 8080",
    ~operator="=",
    (a, b) => a == b,
    Config.default.port,
    8080,
  )
})

test("Config.default ignorePatterns has .git, node_modules, .DS_Store", () => {
  let patterns = Config.default.ignorePatterns
  let hasGit = Array.some(patterns, p => p == ".git")
  let hasNodeModules = Array.some(patterns, p => p == "node_modules")
  let hasDSStore = Array.some(patterns, p => p == ".DS_Store")
  assertion(
    ~message="ignorePatterns contains .git",
    ~operator="=",
    (a, b) => a == b,
    hasGit,
    true,
  )
  assertion(
    ~message="ignorePatterns contains node_modules",
    ~operator="=",
    (a, b) => a == b,
    hasNodeModules,
    true,
  )
  assertion(
    ~message="ignorePatterns contains .DS_Store",
    ~operator="=",
    (a, b) => a == b,
    hasDSStore,
    true,
  )
})

test("Config.default enableDirectoryListing is false", () => {
  assertion(
    ~message="enableDirectoryListing defaults to false",
    ~operator="=",
    (a, b) => a == b,
    Config.default.enableDirectoryListing,
    false,
  )
})

test("Config.default logLevel is Info", () => {
  assertion(
    ~message="logLevel defaults to Info",
    ~operator="=",
    (a, b) => a == b,
    Config.default.logLevel,
    Logger.Info,
  )
})

test("Config.default enableLiveReload is true", () => {
  assertion(
    ~message="enableLiveReload defaults to true",
    ~operator="=",
    (a, b) => a == b,
    Config.default.enableLiveReload,
    true,
  )
})

test("Config.default restartOnChange is false", () => {
  assertion(
    ~message="restartOnChange defaults to false",
    ~operator="=",
    (a, b) => a == b,
    Config.default.restartOnChange,
    false,
  )
})

test("Config.default lan is false", () => {
  assertion(
    ~message="lan defaults to false",
    ~operator="=",
    (a, b) => a == b,
    Config.default.lan,
    false,
  )
})

test("Config.default allowProtectedDir is false", () => {
  assertion(
    ~message="allowProtectedDir defaults to false",
    ~operator="=",
    (a, b) => a == b,
    Config.default.allowProtectedDir,
    false,
  )
})

// ---------------------------------------------------------------------------
// Test: t is a record type with all required fields
// ---------------------------------------------------------------------------

test("Config.t is a record with 10 fields", () => {
  let c = Config.default
  // Verify all fields are accessible (compile-time check at runtime)
  let d = c.directory
  let h = c.hostname
  let p = c.port
  let ip = c.ignorePatterns
  let edl = c.enableDirectoryListing
  let ll = c.logLevel
  let elr = c.enableLiveReload
  let roc = c.restartOnChange
  let lan = c.lan
  let apd = c.allowProtectedDir
  let allAccessible = d != "" && h != "" && p >= 0 &&
    Array.length(ip) > 0 &&
    edl == false && elr == true && roc == false &&
    lan == false && apd == false
  assertion(
    ~message="all 10 Config fields are accessible",
    ~operator="=",
    (a, b) => a == b,
    allAccessible,
    true,
  )
})
