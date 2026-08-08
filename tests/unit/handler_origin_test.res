// handler_origin_test.res — unit tests for WebSocket Origin validation.

open Test

let testConfig = {
  ...Config.default,
  lan: true,
  noAuth: false,
}

test("extractOriginHost: extracts host:port from http URL", () => {
  let result = Origin.extractOriginHost("http://192.168.1.5:8080")
  assertion(
    ~message="extractOriginHost returns host:port",
    ~operator="=",
    (a, b) => a == b,
    result,
    Some("192.168.1.5:8080"),
  )
})

test("extractOriginHost: extracts host:port from https URL with path", () => {
  let result = Origin.extractOriginHost("https://example.com:443/path")
  assertion(
    ~message="extractOriginHost strips path from HTTPS URL",
    ~operator="=",
    (a, b) => a == b,
    result,
    Some("example.com:443"),
  )
})

test("extractOriginHost: returns None for malformed URL (no scheme)", () => {
  let result = Origin.extractOriginHost("malformed")
  assertion(
    ~message="extractOriginHost returns None for malformed input",
    ~operator="=",
    (a, b) => a == b,
    result,
    None,
  )
})

test("checkOrigin: matching origin and host → Allowed", () => {
  let headers = [
    ("origin", "http://127.0.0.1:8080"),
    ("host", "127.0.0.1:8080"),
  ]
  let result = Gate.checkOrigin(~headers, ~host=Some("127.0.0.1:8080"))
  assertion(
    ~message="same-origin WS upgrade is allowed",
    ~operator="=",
    (a, b) => a == b,
    result,
    Gate.Allowed,
  )
})

test("checkOrigin: mismatched origin → Rejected with status 403", () => {
  let headers = [
    ("origin", "http://evil.com"),
    ("host", "127.0.0.1:8080"),
  ]
  let result = Gate.checkOrigin(~headers, ~host=Some("127.0.0.1:8080"))
  switch result {
  | Gate.Rejected({status}) =>
    assertion(
      ~message="cross-origin returns 403",
      ~operator="=",
      (a, b) => a == b,
      status,
      403,
    )
  | Gate.Allowed =>
    assertion(
      ~message="cross-origin must be rejected",
      ~operator="=",
      (a, b) => a == b,
      false,
      true,
    )
  }
})

test("checkOrigin: no Origin header → Allowed (non-browser client)", () => {
  let headers = [
    ("host", "127.0.0.1:8080"),
  ]
  let result = Gate.checkOrigin(~headers, ~host=Some("127.0.0.1:8080"))
  assertion(
    ~message="no-Origin client is allowed",
    ~operator="=",
    (a, b) => a == b,
    result,
    Gate.Allowed,
  )
})

test("checkOrigin: no Host header → Allowed", () => {
  let headers = [
    ("origin", "http://evil.com"),
  ]
  let result = Gate.checkOrigin(~headers, ~host=None)
  assertion(
    ~message="no-Host falls through to Allowed",
    ~operator="=",
    (a, b) => a == b,
    result,
    Gate.Allowed,
  )
})

test("checkOrigin: unparseable Origin → Allowed", () => {
  let headers = [
    ("origin", "malformed-no-scheme"),
    ("host", "127.0.0.1:8080"),
  ]
  let result = Gate.checkOrigin(~headers, ~host=Some("127.0.0.1:8080"))
  assertion(
    ~message="unparseable Origin falls through to Allowed",
    ~operator="=",
    (a, b) => a == b,
    result,
    Gate.Allowed,
  )
})
