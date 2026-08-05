// Security/Tls — TLS certificate loading and self-signed generation.
// Handles explicit cert/key file loading and openssl-based auto-generation.
// Zero npm runtime deps; uses node:fs and node:child_process directly.

// ---------------------------------------------------------------------------
// Exception types
// ---------------------------------------------------------------------------

exception MissingTlsCert(string)
exception MissingTlsKey(string)
exception MissingOpenssl(string)
exception TlsGenerationFailed(string)

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type certKeyPair = {
  cert: Buffer.t,  // PEM-encoded X.509 certificate
  key: Buffer.t,   // PEM-encoded private key
}

// ---------------------------------------------------------------------------
// fs readFileSync — read binary file as Buffer
// ---------------------------------------------------------------------------

@module("node:fs")
external readFileSyncBuffer: string => Buffer.t = "readFileSync"

// ---------------------------------------------------------------------------
// spawnSync result type
// ---------------------------------------------------------------------------

type spawnSyncResult = {
  status: int,
  stdout: Buffer.t,
  stderr: Buffer.t,
}

@module("node:child_process")
external spawnSync: (string, array<string>) => spawnSyncResult = "spawnSync"

// ---------------------------------------------------------------------------
// loadExplicitCert — read and return PEM cert + key buffers from disk.
// Throws MissingTlsCert / MissingTlsKey on ENOENT.
// ---------------------------------------------------------------------------

let loadExplicitCert = (~certPath: string, ~keyPath: string): certKeyPair => {
  let cert = try {
    readFileSyncBuffer(certPath)
  } catch {
  | e =>
    let msg = switch JsExn.message(Obj.magic(e)) {
    | Some(m) => m
    | None => ""
    }
    if String.includes(msg, "ENOENT") || String.includes(msg, "no such file") {
      throw(MissingTlsCert(certPath))
    } else {
      throw(MissingTlsCert(certPath ++ ": " ++ msg))
    }
  }
  let key = try {
    readFileSyncBuffer(keyPath)
  } catch {
  | e =>
    let msg = switch JsExn.message(Obj.magic(e)) {
    | Some(m) => m
    | None => ""
    }
    if String.includes(msg, "ENOENT") || String.includes(msg, "no such file") {
      throw(MissingTlsKey(keyPath))
    } else {
      throw(MissingTlsKey(keyPath ++ ": " ++ msg))
    }
  }
  { cert, key }
}

// ---------------------------------------------------------------------------
// opensslAvailable — check if openssl CLI is present in PATH.
// Uses spawnSync with fixed argv and shell:false (threat-matrix safe).
// ---------------------------------------------------------------------------

let opensslAvailable = (): bool => {
  let result = spawnSync("openssl", ["version"])
  result.status === 0
}

// ---------------------------------------------------------------------------
// ensureOpenssl — throws MissingOpenssl if openssl is not available.
// Call before any openssl-backed operation.
// ---------------------------------------------------------------------------

let ensureOpenssl = (): unit => {
  if !opensslAvailable() {
    throw(
      MissingOpenssl(
        "openssl not found in PATH. Provide explicit --tls-cert and --tls-key files, or install openssl.",
      ),
    )
  }
}

// ---------------------------------------------------------------------------
// generateSelfSigned — generate a self-signed cert in targetDir.
// Creates cert.pem and key.pem in targetDir.
// Uses fixed argv, shell:false; throws MissingOpenssl or TlsGenerationFailed.
// Reuses an existing cert/key pair at the default location if present; only generates a new self-signed cert when none is found (see below).
// ---------------------------------------------------------------------------

let generateSelfSigned = (~targetDir: string): certKeyPair => {
  ensureOpenssl()
  // Ensure targetDir exists (mkdir -p equivalent)
  let _ = try {
    Fs.mkdirSync(targetDir)
  } catch {
  | _e => () // already exists — ignore
  }
  let certPath = Node_Path.join(targetDir, "cert.pem")
  let keyPath = Node_Path.join(targetDir, "key.pem")
  // If both cert and key already exist, reuse them instead of regenerating.
  let existing = try {
    Some(loadExplicitCert(~certPath, ~keyPath))
  } catch {
  | _ => None
  }
  switch existing {
  | Some(pair) => pair
  | None => {
      // Fixed argv array — no string interpolation of user input.
      // shell:false is the default for spawnSync.
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
          "365",
          "-subj",
          "/CN=httpath-local",
        ],
      )
      if result.status !== 0 {
        // Cannot easily convert stderr Buffer to string due to cross-module inlining
        // limitation — include exit code only.
        throw(
          TlsGenerationFailed(
            "openssl req failed with exit code " ++ Belt.Int.toString(result.status),
          ),
        )
      }
      // Read back the generated files to return buffers
      loadExplicitCert(~certPath, ~keyPath)
    }
  }
}
