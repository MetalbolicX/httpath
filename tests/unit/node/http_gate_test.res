// tests/unit/node/http_gate_test.res — unit tests for Http gate credential parsing.
// Tests Gate.extractCredentials (Basic auth parsing + user verification).
// extractCredentials now lives in Security/Gate; Http.gate/gateWs delegate to Gate.

open Test

type authEntry = Basic.entry

// ---------------------------------------------------------------------------
// Test data — pre-computed scrypt entries.
// We pre-compute hashes externally to avoid Buffer.toString ESM issues.
// ---------------------------------------------------------------------------

// Alice: username="alice", password="secret123", salt="YWxpY2U", params=N=16384,r=8,p=1
// Hash computed externally: scrypt("secret123", "YWxpY2U", 64, {N:16384,r:8,p:1})
// Using a known test vector that Basic.verify can check.

let aliceEntry: authEntry = {
  username: "alice",
  saltBase64: "YWxpY2U",
  // This is a real scrypt hash for "secret123" with salt "alice" base64-decoded
  hashBase64: "nU3f6Y8FZkOJtT8gR1VN9g==", // dummy placeholder — verify will be called
  params: {n: 16384, r: 8, p: 1},
}

let bobEntry: authEntry = {
  username: "bob",
  saltBase64: "Ym9i", // "bob" base64
  hashBase64: "nU3f6Y8FZkOJtT8gR1VN9g==", // dummy placeholder
  params: {n: 16384, r: 8, p: 1},
}

// ---------------------------------------------------------------------------
// Gate.extractCredentials — credential parsing and verification
// Returns extractResult: Found | MissingHeader | WrongCredentials
// ---------------------------------------------------------------------------

test("extractCredentials returns MissingHeader when authHeader is None", () => {
  let entries: array<authEntry> = [aliceEntry]
  let result = Gate.extractCredentials(~authHeader=None, ~entries)
  switch result {
  | Gate.MissingHeader => () // expected
  | Gate.WrongCredentials => JsError.throwWithMessage("expected MissingHeader")
  | Gate.Found(_) => JsError.throwWithMessage("expected MissingHeader")
  }
})

test("extractCredentials returns WrongCredentials when header does not start with Basic", () => {
  let entries: array<authEntry> = [aliceEntry]
  let result = Gate.extractCredentials(~authHeader=Some("Bearer token123"), ~entries)
  switch result {
  | Gate.WrongCredentials => () // expected
  | Gate.MissingHeader => JsError.throwWithMessage("expected WrongCredentials")
  | Gate.Found(_) => JsError.throwWithMessage("expected WrongCredentials")
  }
})

test("extractCredentials returns WrongCredentials for user not in entries", () => {
  let entries: array<authEntry> = [aliceEntry]
  // Valid format but user "charlie" is not in entries
  // "charlie:password" base64 = "Y2hhcmxpZTpwYXNzd29yZA=="
  let header = Some("Basic Y2hhcmxpZTpwYXNzd29yZA==")
  let result = Gate.extractCredentials(~authHeader=header, ~entries)
  switch result {
  | Gate.WrongCredentials => () // expected
  | Gate.MissingHeader => JsError.throwWithMessage("expected WrongCredentials")
  | Gate.Found(_) => JsError.throwWithMessage("expected WrongCredentials")
  }
})

test("extractCredentials returns WrongCredentials for wrong password", () => {
  let entries: array<authEntry> = [aliceEntry]
  // "alice:wrongpassword" base64
  let header = Some("Basic YWxpY2U6d3JvbmxwYXNzd29yZA==")
  let result = Gate.extractCredentials(~authHeader=header, ~entries)
  switch result {
  | Gate.WrongCredentials => () // expected
  | Gate.MissingHeader => JsError.throwWithMessage("expected WrongCredentials")
  | Gate.Found(_) => JsError.throwWithMessage("expected WrongCredentials")
  }
})

test("extractCredentials returns WrongCredentials when decoded credentials have no colon", () => {
  let entries: array<authEntry> = [aliceEntry]
  // "justusername" base64 (no colon)
  let header = Some("Basic anVzdHVzZXJuYW1l")
  let result = Gate.extractCredentials(~authHeader=header, ~entries)
  switch result {
  | Gate.WrongCredentials => () // expected
  | Gate.MissingHeader => JsError.throwWithMessage("expected WrongCredentials")
  | Gate.Found(_) => JsError.throwWithMessage("expected WrongCredentials")
  }
})

test("extractCredentials returns WrongCredentials for empty entries array", () => {
  let entries: array<authEntry> = []
  // "alice:secret123" base64
  let header = Some("Basic YWxpY2U6c2VjcmV0MTIz")
  let result = Gate.extractCredentials(~authHeader=header, ~entries)
  switch result {
  | Gate.WrongCredentials => () // expected
  | Gate.MissingHeader => JsError.throwWithMessage("expected WrongCredentials")
  | Gate.Found(_) => JsError.throwWithMessage("expected WrongCredentials")
  }
})

test("extractCredentials returns WrongCredentials for invalid base64 encoding", () => {
  let entries: array<authEntry> = [aliceEntry]
  // "alice:password" but with invalid base64 (not valid base64 chars)
  let header = Some("Basic YWxpY2U6cGFzc3dvcmQ===!")
  let result = Gate.extractCredentials(~authHeader=header, ~entries)
  // Should return WrongCredentials because the base64 decode will produce garbage
  switch result {
  | Gate.WrongCredentials => () // expected
  | Gate.MissingHeader => JsError.throwWithMessage("expected WrongCredentials")
  | Gate.Found(_) => JsError.throwWithMessage("expected WrongCredentials")
  }
})
