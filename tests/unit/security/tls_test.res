// tests/unit/security/tls_test.res — unit tests for Security/Tls module.
// Strict TDD: RED tests written first.
// Tests TLS cert loading, openssl availability checks, and self-signed generation.

open Test

// ---------------------------------------------------------------------------
// Temp dir helpers (same pattern as node_fs_test.res)
// ---------------------------------------------------------------------------

@module("node:os") external tmpdir: unit => string = "tmpdir"
@module("node:path") external join: (string, string) => string = "join"
@module("node:fs") external mkdtemp: string => string = "mkdtempSync"
@module("node:fs") external rmdirSync: string => unit = "rmdirSync"
@module("node:fs") external mkdirSync: string => unit = "mkdirSync"
@module("node:fs") external writeFileSync: (string, string) => unit = "writeFileSync"
@module("node:fs") external unlinkSync: string => unit = "unlinkSync"

// Buffer.toString via BufferImpl.mjs to avoid @send cross-module inlining issue
@module("./BufferImpl.mjs")
external bufferToString: (Buffer.t, string) => string = "toString"

// spawnSync binding for test setup
type spawnSyncResult = {
  status: int,
  stdout: Buffer.t,
  stderr: Buffer.t,
}
@module("node:child_process")
external spawnSync: (string, array<string>) => spawnSyncResult = "spawnSync"

// ---------------------------------------------------------------------------
// withTempDir helper
// ---------------------------------------------------------------------------

let withTempDir = (f: string => unit): unit => {
  let prefix = join(tmpdir(), "httpath.tls.test.")
  let tempDir = mkdtemp(prefix)
  try {
    f(tempDir)
  } catch {
  | _e =>
    try { rmdirSync(tempDir) } catch { | _ => () }
  }
  try { rmdirSync(tempDir) } catch { | _ => () }
}

// ---------------------------------------------------------------------------
// Tls.loadExplicitCert — happy path returns cert+key buffers
// ---------------------------------------------------------------------------

test("Tls.loadExplicitCert returns cert and key buffers for existing files", () => {
  withTempDir(tempDir => {
    // Create a minimal self-signed cert+key using openssl for the fixture
    let certPath = join(tempDir, "cert.pem")
    let keyPath = join(tempDir, "key.pem")
    let result = spawnSync(
      "openssl",
      [
        "req",
        "-x509",
        "-newkey",
        "rsa:2048",
        "-nodes",
        "-keyout",
        keyPath,
        "-out",
        certPath,
        "-days",
        "1",
        "-subj",
        "/CN=httpath-test",
      ],
    )
    if result.status !== 0 {
      JsError.throwWithMessage("Failed to create test cert: exit " ++ Belt.Int.toString(result.status))
    }
    switch Tls.loadExplicitCert(~certPath, ~keyPath) {
    | exception e =>
      JsError.throwWithMessage("loadExplicitCert should not throw for valid files: " ++ Belt.Option.getWithDefault(JsExn.message(Obj.magic(e)), "unknown"))
    | { cert, key } =>
      assertion(
        ~message="cert buffer is non-empty",
        ~operator=">",
        (a, b) => a > b,
        Buffer.length(cert),
        0,
      )
      assertion(
        ~message="key buffer is non-empty",
        ~operator=">",
        (a, b) => a > b,
        Buffer.length(key),
        0,
      )
    }
  })
})

// ---------------------------------------------------------------------------
// Tls.loadExplicitCert — missing cert throws MissingTlsCert
// ---------------------------------------------------------------------------

test("Tls.loadExplicitCert throws MissingTlsCert when cert file does not exist", () => {
  withTempDir(tempDir => {
    let certPath = join(tempDir, "nonexistent-cert.pem")
    let keyPath = join(tempDir, "key.pem")
    writeFileSync(keyPath, "placeholder key")
    switch Tls.loadExplicitCert(~certPath, ~keyPath) {
    | exception Tls.MissingTlsCert(_) => () // expected
    | exception e =>
      JsError.throwWithMessage("Expected MissingTlsCert, got: " ++ Belt.Option.getWithDefault(JsExn.message(Obj.magic(e)), "unknown"))
    | _ => JsError.throwWithMessage("Expected MissingTlsCert exception")
    }
  })
})

// ---------------------------------------------------------------------------
// Tls.loadExplicitCert — missing key throws MissingTlsKey
// ---------------------------------------------------------------------------

test("Tls.loadExplicitCert throws MissingTlsKey when key file does not exist", () => {
  withTempDir(tempDir => {
    let certPath = join(tempDir, "cert.pem")
    let keyPath = join(tempDir, "nonexistent-key.pem")
    writeFileSync(certPath, "placeholder cert")
    switch Tls.loadExplicitCert(~certPath, ~keyPath) {
    | exception Tls.MissingTlsKey(_) => () // expected
    | exception e =>
      JsError.throwWithMessage("Expected MissingTlsKey, got: " ++ Belt.Option.getWithDefault(JsExn.message(Obj.magic(e)), "unknown"))
    | _ => JsError.throwWithMessage("Expected MissingTlsKey exception")
    }
  })
})

// ---------------------------------------------------------------------------
// Tls.ensureOpenssl — openssl available: no throw
// ---------------------------------------------------------------------------

test("Tls.ensureOpenssl does not throw when openssl is in PATH", () => {
  switch Tls.ensureOpenssl() {
  | exception e =>
    JsError.throwWithMessage("ensureOpenssl should not throw when openssl is available: " ++ Belt.Option.getWithDefault(JsExn.message(Obj.magic(e)), "unknown"))
  | () => () // expected
  }
})

// ---------------------------------------------------------------------------
// Tls.generateSelfSigned — creates cert.pem and key.pem in targetDir
// ---------------------------------------------------------------------------

test("Tls.generateSelfSigned creates cert.pem and key.pem in targetDir", () => {
  withTempDir(tempDir => {
    switch Tls.generateSelfSigned(~targetDir=tempDir) {
    | exception e =>
      JsError.throwWithMessage("generateSelfSigned should not throw: " ++ Belt.Option.getWithDefault(JsExn.message(Obj.magic(e)), "unknown"))
    | { cert, key } =>
      assertion(
        ~message="cert buffer is non-empty",
        ~operator=">",
        (a, b) => a > b,
        Buffer.length(cert),
        0,
      )
      assertion(
        ~message="key buffer is non-empty",
        ~operator=">",
        (a, b) => a > b,
        Buffer.length(key),
        0,
      )
    }
  })
})

// ---------------------------------------------------------------------------
// Tls.generateSelfSigned — overwrites existing files (documented behavior)
// ---------------------------------------------------------------------------

test("Tls.generateSelfSigned overwrites existing cert and key files", () => {
  withTempDir(tempDir => {
    // Write placeholder files
    writeFileSync(join(tempDir, "cert.pem"), "placeholder cert")
    writeFileSync(join(tempDir, "key.pem"), "placeholder key")
    // generateSelfSigned should overwrite without error
    switch Tls.generateSelfSigned(~targetDir=tempDir) {
    | exception e =>
      JsError.throwWithMessage(
        "generateSelfSigned should overwrite existing files: " ++ Belt.Option.getWithDefault(JsExn.message(Obj.magic(e)), "unknown"),
      )
    | { cert, key } =>
      // Should have real PEM content, not "placeholder cert"
      // We can't use Buffer.toString due to cross-module inlining limitations,
      // but we can check that the buffer lengths are non-zero and different
      // from what "placeholder" would produce
      let placeholderLen = String.length("placeholder cert")
      assertion(
        ~message="generated cert is not the placeholder (length check)",
        ~operator="!=",
        (a, b) => a != b,
        Buffer.length(cert),
        placeholderLen,
      )
      let keyPlaceholderLen = String.length("placeholder key")
      assertion(
        ~message="generated key is not the placeholder (length check)",
        ~operator="!=",
        (a, b) => a != b,
        Buffer.length(key),
        keyPlaceholderLen,
      )
    }
  })
})

// ---------------------------------------------------------------------------
// Tls.generateSelfSigned — reuse path: second call returns identical cert
// ---------------------------------------------------------------------------

test("Tls.generateSelfSigned reuses existing cert on second call", () => {
  withTempDir(tempDir => {
    // First call: generate cert and key
    let { cert: cert1, key: key1 } = switch Tls.generateSelfSigned(~targetDir=tempDir) {
    | exception e =>
      JsError.throwWithMessage("first generateSelfSigned should not throw: " ++ Belt.Option.getWithDefault(JsExn.message(Obj.magic(e)), "unknown"))
    | pair => pair
    }
    // Second call: should reuse existing files, not regenerate
    let { cert: cert2, key: key2 } = switch Tls.generateSelfSigned(~targetDir=tempDir) {
    | exception e =>
      JsError.throwWithMessage("second generateSelfSigned should not throw: " ++ Belt.Option.getWithDefault(JsExn.message(Obj.magic(e)), "unknown"))
    | pair => pair
    }
    // If reuse path is taken, cert bytes must be identical.
    // If openssl ran twice, the cert would differ (new key each time).
    let cert1B64 = bufferToString(cert1, "base64")
    let cert2B64 = bufferToString(cert2, "base64")
    assertion(
      ~message="cert is identical on second call (proves reuse path taken)",
      ~operator="==",
      (a, b) => a == b,
      cert1B64,
      cert2B64,
    )
    let key1B64 = bufferToString(key1, "base64")
    let key2B64 = bufferToString(key2, "base64")
    assertion(
      ~message="key is identical on second call (proves reuse path taken)",
      ~operator="==",
      (a, b) => a == b,
      key1B64,
      key2B64,
    )
  })
})

// ---------------------------------------------------------------------------
// Tls.generateSelfSigned — missing key triggers regeneration (not reuse)
// ---------------------------------------------------------------------------

test("Tls.generateSelfSigned regenerates when key.pem is missing", () => {
  withTempDir(tempDir => {
    // First call: generate cert and key
    let { cert: cert1 } = switch Tls.generateSelfSigned(~targetDir=tempDir) {
    | exception e =>
      JsError.throwWithMessage("first generateSelfSigned should not throw: " ++ Belt.Option.getWithDefault(JsExn.message(Obj.magic(e)), "unknown"))
    | pair => pair
    }
    // Delete key.pem but leave cert.pem
    let keyPath = join(tempDir, "key.pem")
    unlinkSync(keyPath)
    // Second call: key is gone, so reuse path fails → openssl regenerates
    let { cert: cert2 } = switch Tls.generateSelfSigned(~targetDir=tempDir) {
    | exception e =>
      JsError.throwWithMessage("generateSelfSigned should regenerate after key deletion: " ++ Belt.Option.getWithDefault(JsExn.message(Obj.magic(e)), "unknown"))
    | pair => pair
    }
    // The new cert must differ from the old one because a new key was generated.
    let cert1B64 = bufferToString(cert1, "base64")
    let cert2B64 = bufferToString(cert2, "base64")
    assertion(
      ~message="cert differs after key deletion (proves new key was generated)",
      ~operator="!=",
      (a, b) => a != b,
      cert1B64,
      cert2B64,
    )
  })
})

// ---------------------------------------------------------------------------
// Tls.generateSelfSigned — missing cert triggers regeneration (not reuse)
// ---------------------------------------------------------------------------

test("Tls.generateSelfSigned regenerates when cert.pem is missing", () => {
  withTempDir(tempDir => {
    // First call: generate cert and key
    let { cert: cert1 } = switch Tls.generateSelfSigned(~targetDir=tempDir) {
    | exception e =>
      JsError.throwWithMessage("first generateSelfSigned should not throw: " ++ Belt.Option.getWithDefault(JsExn.message(Obj.magic(e)), "unknown"))
    | pair => pair
    }
    // Delete cert.pem but leave key.pem
    let certPath = join(tempDir, "cert.pem")
    unlinkSync(certPath)
    // Second call: cert is gone, so reuse path fails → openssl regenerates
    let { cert: cert2 } = switch Tls.generateSelfSigned(~targetDir=tempDir) {
    | exception e =>
      JsError.throwWithMessage("generateSelfSigned should regenerate after cert deletion: " ++ Belt.Option.getWithDefault(JsExn.message(Obj.magic(e)), "unknown"))
    | pair => pair
    }
    // The new cert must differ from the old one because a new key was generated.
    let cert1B64 = bufferToString(cert1, "base64")
    let cert2B64 = bufferToString(cert2, "base64")
    assertion(
      ~message="cert differs after cert deletion (proves new cert+key were generated)",
      ~operator="!=",
      (a, b) => a != b,
      cert1B64,
      cert2B64,
    )
  })
})
