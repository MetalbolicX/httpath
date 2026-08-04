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
  assertion(~message="ignorePatterns contains .git", ~operator="=", (a, b) => a == b, hasGit, true)
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

test("Config.default enableDirectoryListing is true", () => {
  assertion(
    ~message="enableDirectoryListing defaults to true",
    ~operator="=",
    (a, b) => a == b,
    Config.default.enableDirectoryListing,
    true,
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
// New LAN security fields — defaults outside LAN mode
// ---------------------------------------------------------------------------

test("Config.default authFile is None", () => {
  assertion(
    ~message="authFile defaults to None",
    ~operator="=",
    (a, b) => a == b,
    Config.default.authFile,
    None,
  )
})

test("Config.default noAuth is false", () => {
  assertion(
    ~message="noAuth defaults to false",
    ~operator="=",
    (a, b) => a == b,
    Config.default.noAuth,
    false,
  )
})

test("Config.default tls is false", () => {
  assertion(
    ~message="tls defaults to false",
    ~operator="=",
    (a, b) => a == b,
    Config.default.tls,
    false,
  )
})

test("Config.default tlsCert is None", () => {
  assertion(
    ~message="tlsCert defaults to None",
    ~operator="=",
    (a, b) => a == b,
    Config.default.tlsCert,
    None,
  )
})

test("Config.default tlsKey is None", () => {
  assertion(
    ~message="tlsKey defaults to None",
    ~operator="=",
    (a, b) => a == b,
    Config.default.tlsKey,
    None,
  )
})

test("Config.default rateLimitMax is 0", () => {
  assertion(
    ~message="rateLimitMax defaults to 0",
    ~operator="=",
    (a, b) => a == b,
    Config.default.rateLimitMax,
    0,
  )
})

test("Config.default rateLimitWindow is 0", () => {
  assertion(
    ~message="rateLimitWindow defaults to 0",
    ~operator="=",
    (a, b) => a == b,
    Config.default.rateLimitWindow,
    0,
  )
})

test("Config.default rateLimitEnabled is false", () => {
  assertion(
    ~message="rateLimitEnabled defaults to false",
    ~operator="=",
    (a, b) => a == b,
    Config.default.rateLimitEnabled,
    false,
  )
})

test("Config.default accessLog is None", () => {
  assertion(
    ~message="accessLog defaults to None",
    ~operator="=",
    (a, b) => a == b,
    Config.default.accessLog,
    None,
  )
})

test("Config.default readOnly is false", () => {
  assertion(
    ~message="readOnly defaults to false",
    ~operator="=",
    (a, b) => a == b,
    Config.default.readOnly,
    false,
  )
})

// ---------------------------------------------------------------------------
// Test: t is a record type with all required fields
// ---------------------------------------------------------------------------

test("Config.t is a record with 20 fields", () => {
  let c = Config.default
  // Verify all fields are accessible (compile-time check at runtime)
  let d = c.directory
  let h = c.hostname
  let p = c.port
  let ip = c.ignorePatterns
  let edl = c.enableDirectoryListing
  let _ll = c.logLevel
  let elr = c.enableLiveReload
  let roc = c.restartOnChange
  let lan = c.lan
  let apd = c.allowProtectedDir
  let af = c.authFile
  let na = c.noAuth
  let tls = c.tls
  let tc = c.tlsCert
  let tk = c.tlsKey
  let rlm = c.rateLimitMax
  let rlw = c.rateLimitWindow
  let rle = c.rateLimitEnabled
  let al = c.accessLog
  let ro = c.readOnly
  let allAccessible =
    d != "" &&
    h != "" &&
    p >= 0 &&
    Array.length(ip) > 0 &&
    edl == true &&
    elr == true &&
    roc == false &&
    lan == false &&
    apd == false &&
    af == None &&
    na == false &&
    tls == false &&
    tc == None &&
    tk == None &&
    rlm == 0 &&
    rlw == 0 &&
    rle == false &&
    al == None &&
    ro == false
  assertion(
    ~message="all 20 Config fields are accessible",
    ~operator="=",
    (a, b) => a == b,
    allAccessible,
    true,
  )
})
