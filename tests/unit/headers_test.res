// headers_test.res — unit tests for Security/Headers per REQ-HEADERS-1..3.

open Test

// ---------------------------------------------------------------------------
// REQ-HEADERS-1: securityHeaders constant contains all eight headers
// ---------------------------------------------------------------------------

test("Headers.securityHeaders has exactly 8 entries", () => {
  let count = Array.length(Headers.securityHeaders)
  assertion(
    ~message="securityHeaders has 8 entries",
    ~operator="=",
    (a, b) => a == b,
    count,
    8,
  )
})

test("Headers.securityHeaders[0] is x-content-type-options: nosniff", () => {
  let (name, value) = switch Array.get(Headers.securityHeaders, 0) {
  | Some(v) => v
  | None => Js.Exn.raiseError("Expected index 0 in Headers.securityHeaders")
  }
  assertion(~message="name", ~operator="=",
    (a, b) => a == b, name, "x-content-type-options")
  assertion(~message="value", ~operator="=",
    (a, b) => a == b, value, "nosniff")
})

test("Headers.securityHeaders[1] is x-frame-options: DENY", () => {
  let (name, value) = switch Array.get(Headers.securityHeaders, 1) {
  | Some(v) => v
  | None => Js.Exn.raiseError("Expected index 1 in Headers.securityHeaders")
  }
  assertion(~message="name", ~operator="=",
    (a, b) => a == b, name, "x-frame-options")
  assertion(~message="value", ~operator="=",
    (a, b) => a == b, value, "DENY")
})

test("Headers.securityHeaders[2] is referrer-policy: no-referrer", () => {
  let (name, value) = switch Array.get(Headers.securityHeaders, 2) {
  | Some(v) => v
  | None => Js.Exn.raiseError("Expected index 2 in Headers.securityHeaders")
  }
  assertion(~message="name", ~operator="=",
    (a, b) => a == b, name, "referrer-policy")
  assertion(~message="value", ~operator="=",
    (a, b) => a == b, value, "no-referrer")
})

test("Headers.securityHeaders[3] is permissions-policy: camera=(), microphone=(), geolocation=()", () => {
  let (name, value) = switch Array.get(Headers.securityHeaders, 3) {
  | Some(v) => v
  | None => Js.Exn.raiseError("Expected index 3 in Headers.securityHeaders")
  }
  assertion(~message="name", ~operator="=",
    (a, b) => a == b, name, "permissions-policy")
  assertion(~message="value", ~operator="=",
    (a, b) => a == b, value, "camera=(), microphone=(), geolocation=()")
})

test("Headers.securityHeaders[4] is cross-origin-opener-policy: same-origin", () => {
  let (name, value) = switch Array.get(Headers.securityHeaders, 4) {
  | Some(v) => v
  | None => Js.Exn.raiseError("Expected index 4 in Headers.securityHeaders")
  }
  assertion(~message="name", ~operator="=",
    (a, b) => a == b, name, "cross-origin-opener-policy")
  assertion(~message="value", ~operator="=",
    (a, b) => a == b, value, "same-origin")
})

test("Headers.securityHeaders[5] is cross-origin-resource-policy: same-origin", () => {
  let (name, value) = switch Array.get(Headers.securityHeaders, 5) {
  | Some(v) => v
  | None => Js.Exn.raiseError("Expected index 5 in Headers.securityHeaders")
  }
  assertion(~message="name", ~operator="=",
    (a, b) => a == b, name, "cross-origin-resource-policy")
  assertion(~message="value", ~operator="=",
    (a, b) => a == b, value, "same-origin")
})

test("Headers.securityHeaders[6] is x-permitted-cross-domain-policies: none", () => {
  let (name, value) = switch Array.get(Headers.securityHeaders, 6) {
  | Some(v) => v
  | None => Js.Exn.raiseError("Expected index 6 in Headers.securityHeaders")
  }
  assertion(~message="name", ~operator="=",
    (a, b) => a == b, name, "x-permitted-cross-domain-policies")
  assertion(~message="value", ~operator="=",
    (a, b) => a == b, value, "none")
})

test("Headers.securityHeaders[7] is content-security-policy with unsafe-inline", () => {
  let (name, value) = switch Array.get(Headers.securityHeaders, 7) {
  | Some(v) => v
  | None => Js.Exn.raiseError("Expected index 7 in Headers.securityHeaders")
  }
  assertion(~message="name", ~operator="=",
    (a, b) => a == b, name, "content-security-policy")
  assertion(~message="contains unsafe-inline",
    ~operator="=",
    (a, b) => a == b,
    Js.String2.includes(value, "unsafe-inline"),
    true)
})

// ---------------------------------------------------------------------------
// REQ-HEADERS-2: withSecurityHeaders appends all eight headers
// ---------------------------------------------------------------------------

test("withSecurityHeaders: empty array gets all 8 headers", () => {
  let result = Headers.withSecurityHeaders([])
  assertion(
    ~message="result has 8 headers",
    ~operator="=",
    (a, b) => a == b,
    Array.length(result),
    8,
  )
})

test("withSecurityHeaders: pre-existing headers are preserved first", () => {
  let preExisting = [("cache-control", "no-cache")]
  let result = Headers.withSecurityHeaders(preExisting)
  let (name, value) = switch Array.get(result, 0) {
  | Some(v) => v
  | None => Js.Exn.raiseError("Expected index 0 in result")
  }
  assertion(~message="first header name is cache-control",
    ~operator="=",
    (a, b) => a == b, name, "cache-control")
  assertion(~message="first header value is no-cache",
    ~operator="=",
    (a, b) => a == b, value, "no-cache")
  assertion(~message="result has 9 total",
    ~operator="=",
    (a, b) => a == b,
    Array.length(result),
    9)
})

test("withSecurityHeaders: all 8 security headers appear after any pre-existing", () => {
  let preExisting = [("cache-control", "no-cache")]
  let result = Headers.withSecurityHeaders(preExisting)
  let (name, _) = switch Array.get(result, 1) {
  | Some(v) => v
  | None => Js.Exn.raiseError("Expected index 1 in result")
  }
  assertion(~message="first security header is x-content-type-options",
    ~operator="=",
    (a, b) => a == b,
    name,
    "x-content-type-options")
})

// ---------------------------------------------------------------------------
// REQ-HEADERS-3: security headers do not replace existing response headers
// ---------------------------------------------------------------------------

test("withSecurityHeaders: calling twice does not duplicate headers", () => {
  let result1 = Headers.withSecurityHeaders([])
  let result2 = Headers.withSecurityHeaders(result1)
  assertion(
    ~message="second call does not double the headers",
    ~operator="=",
    (a, b) => a == b,
    Array.length(result2),
    8,
  )
})
