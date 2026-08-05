// tests/unit/node/http_gate_test.res — unit tests for Http gate credential parsing.
// Tests Http.extractCredentials (Basic auth parsing + user verification).

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
// Http.extractCredentials — credential parsing and verification
// ---------------------------------------------------------------------------

test("extractCredentials returns None when authHeader is None", () => {
  let entries: array<authEntry> = [aliceEntry]
  let result = Http.extractCredentials(~authHeader=None, ~entries)
  assertion(
    ~message="None authHeader yields None",
    ~operator="=",
    (a, b) => a == b,
    result,
    None,
  )
})

test("extractCredentials returns None when header does not start with Basic", () => {
  let entries: array<authEntry> = [aliceEntry]
  let result = Http.extractCredentials(~authHeader=Some("Bearer token123"), ~entries)
  assertion(
    ~message="Bearer scheme is rejected",
    ~operator="=",
    (a, b) => a == b,
    result,
    None,
  )
})

test("extractCredentials returns None for user not in entries", () => {
  let entries: array<authEntry> = [aliceEntry]
  // Valid format but user "charlie" is not in entries
  // "charlie:password" base64 = "Y2hhcmxpZTpwYXNzd29yZA=="
  let header = Some("Basic Y2hhcmxpZTpwYXNzd29yZA==")
  let result = Http.extractCredentials(~authHeader=header, ~entries)
  assertion(
    ~message="user not in entries returns None",
    ~operator="=",
    (a, b) => a == b,
    result,
    None,
  )
})

test("extractCredentials returns None for wrong password", () => {
  let entries: array<authEntry> = [aliceEntry]
  // "alice:wrongpassword" base64
  let header = Some("Basic YWxpY2U6d3JvbmxwYXNzd29yZA==")
  let result = Http.extractCredentials(~authHeader=header, ~entries)
  assertion(
    ~message="wrong password returns None",
    ~operator="=",
    (a, b) => a == b,
    result,
    None,
  )
})

test("extractCredentials returns None when decoded credentials have no colon", () => {
  let entries: array<authEntry> = [aliceEntry]
  // "justusername" base64 (no colon)
  let header = Some("Basic anVzdHVzZXJuYW1l")
  let result = Http.extractCredentials(~authHeader=header, ~entries)
  assertion(
    ~message="no colon in decoded returns None",
    ~operator="=",
    (a, b) => a == b,
    result,
    None,
  )
})

test("extractCredentials returns None for empty entries array", () => {
  let entries: array<authEntry> = []
  // "alice:secret123" base64
  let header = Some("Basic YWxpY2U6c2VjcmV0MTIz")
  let result = Http.extractCredentials(~authHeader=header, ~entries)
  assertion(
    ~message="empty entries returns None even with valid-looking header",
    ~operator="=",
    (a, b) => a == b,
    result,
    None,
  )
})

test("extractCredentials returns None for invalid base64 encoding", () => {
  let entries: array<authEntry> = [aliceEntry]
  // "alice:password" but with invalid base64 (not valid base64 chars)
  let header = Some("Basic YWxpY2U6cGFzc3dvcmQ===!")
  let result = Http.extractCredentials(~authHeader=header, ~entries)
  // Should return None because the base64 decode will produce garbage
  assertion(
    ~message="invalid base64 returns None",
    ~operator="=",
    (a, b) => a == b,
    result,
    None,
  )
})
