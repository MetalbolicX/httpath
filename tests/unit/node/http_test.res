// tests/unit/node/http_test.res — unit tests for Node/Http client IP resolution.
// Strict TDD: RED tests written first.
// Tests socket.remoteAddress resolution and X-Forwarded-For trustProxy behavior.

open Test

// ---------------------------------------------------------------------------
// Http.resolveClientIp — pure IP resolution logic
// ---------------------------------------------------------------------------

// Direct unit tests for the IP resolution logic.
// These test the behavior described in the lan-rate-limit spec:
// - remoteAddress used when trustProxy=false
// - X-Forwarded-For honored when trustProxy=true

test("Http.resolveClientIp uses socket IP when trustProxy=false and no XFF", () => {
  let socketIp = "192.168.1.42"
  let headers: array<(string, string)> = []
  let result = Http.resolveClientIp(~trustProxy=false, ~socketIp, ~headers)
  assertion(
    ~message="clientIp is socket remoteAddress when trustProxy=false",
    ~operator="=",
    (a, b) => a == b,
    result,
    socketIp,
  )
})

test("Http.resolveClientIp uses X-Forwarded-For when trustProxy=true", () => {
  let socketIp = "127.0.0.1"
  let headers: array<(string, string)> = [("x-forwarded-for", "10.0.0.5")]
  let result = Http.resolveClientIp(~trustProxy=true, ~socketIp, ~headers)
  assertion(
    ~message="clientIp is first XFF entry when trustProxy=true",
    ~operator="=",
    (a, b) => a == b,
    result,
    "10.0.0.5",
  )
})

test("Http.resolveClientIp takes first XFF entry before comma", () => {
  let socketIp = "127.0.0.1"
  let headers: array<(string, string)> = [("x-forwarded-for", "10.0.0.5, 192.168.1.1, 172.16.0.1")]
  let result = Http.resolveClientIp(~trustProxy=true, ~socketIp, ~headers)
  assertion(
    ~message="clientIp is first IP before comma",
    ~operator="=",
    (a, b) => a == b,
    result,
    "10.0.0.5",
  )
})

test("Http.resolveClientIp trims whitespace from XFF entry", () => {
  let socketIp = "127.0.0.1"
  let headers: array<(string, string)> = [("x-forwarded-for", "  10.0.0.5  , 192.168.1.1")]
  let result = Http.resolveClientIp(~trustProxy=true, ~socketIp, ~headers)
  assertion(
    ~message="clientIp is trimmed of whitespace",
    ~operator="=",
    (a, b) => a == b,
    result,
    "10.0.0.5",
  )
})

test("Http.resolveClientIp falls back to socket IP when XFF empty", () => {
  let socketIp = "192.168.1.100"
  let headers: array<(string, string)> = [("x-forwarded-for", "")]
  let result = Http.resolveClientIp(~trustProxy=true, ~socketIp, ~headers)
  assertion(
    ~message="clientIp falls back to socket IP for empty XFF",
    ~operator="=",
    (a, b) => a == b,
    result,
    socketIp,
  )
})

test("Http.resolveClientIp falls back to socket IP when trustProxy=false even with XFF", () => {
  let socketIp = "192.168.1.100"
  let headers: array<(string, string)> = [("x-forwarded-for", "10.0.0.5")]
  let result = Http.resolveClientIp(~trustProxy=false, ~socketIp, ~headers)
  assertion(
    ~message="XFF ignored when trustProxy=false",
    ~operator="=",
    (a, b) => a == b,
    result,
    socketIp,
  )
})

test("Http.resolveClientIp uses remoteAddress when no socket (unknown)", () => {
  let headers: array<(string, string)> = []
  let result = Http.resolveClientIp(~trustProxy=false, ~socketIp="unknown", ~headers)
  assertion(
    ~message="clientIp is unknown when no socket info",
    ~operator="=",
    (a, b) => a == b,
    result,
    "unknown",
  )
})
