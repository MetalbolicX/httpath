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

// ---------------------------------------------------------------------------
// Plan 024: XFF gated behind trusted-proxy CIDR allowlist
// ---------------------------------------------------------------------------

// Ip.cidrMatch — pure CIDR matching

test("cidrMatch(\"10.0.0.5\", \"10.0.0.0/8\") → true", () => {
  assertion(
    ~message="10.0.0.5 is in 10.0.0.0/8",
    ~operator="=",
    (a, b) => a == b,
    Ip.cidrMatch("10.0.0.5", "10.0.0.0/8"),
    true,
  )
})

test("cidrMatch(\"11.0.0.1\", \"10.0.0.0/8\") → false", () => {
  assertion(
    ~message="11.0.0.1 is NOT in 10.0.0.0/8",
    ~operator="=",
    (a, b) => a == b,
    Ip.cidrMatch("11.0.0.1", "10.0.0.0/8"),
    false,
  )
})

test("cidrMatch(\"10.0.0.5\", \"10.0.0.5/32\") → true (exact /32)", () => {
  assertion(
    ~message="exact /32 match",
    ~operator="=",
    (a, b) => a == b,
    Ip.cidrMatch("10.0.0.5", "10.0.0.5/32"),
    true,
  )
})

test("cidrMatch(\"192.168.1.100\", \"192.168.0.0/16\") → true (/16 range)", () => {
  assertion(
    ~message="192.168.1.100 is in 192.168.0.0/16",
    ~operator="=",
    (a, b) => a == b,
    Ip.cidrMatch("192.168.1.100", "192.168.0.0/16"),
    true,
  )
})

test("cidrMatch(\"::1\", \"::1/128\") → true (IPv6 exact)", () => {
  assertion(
    ~message="::1 is in ::1/128",
    ~operator="=",
    (a, b) => a == b,
    Ip.cidrMatch("::1", "::1/128"),
    true,
  )
})

test("cidrMatch(\"fd00::1\", \"fd00::/8\") → true (IPv6 prefix)", () => {
  assertion(
    ~message="fd00::1 is in fd00::/8",
    ~operator="=",
    (a, b) => a == b,
    Ip.cidrMatch("fd00::1", "fd00::/8"),
    true,
  )
})

// Ip.resolveClientIp — XFF gated behind CIDR allowlist

test("peer NOT in trustedCidrs → returns peer, XFF ignored", () => {
  let result = Ip.resolveClientIp(
    ~peer="203.0.113.50",
    ~xff=["10.0.0.5"],
    ~trustedCidrs=["10.0.0.0/8"],
  )
  assertion(
    ~message="peer not in allowlist → XFF ignored",
    ~operator="=",
    (a, b) => a == b,
    result,
    "203.0.113.50",
  )
})

test("peer IN trustedCidrs → returns first XFF entry", () => {
  let result = Ip.resolveClientIp(
    ~peer="10.0.0.1",
    ~xff=["10.0.0.5"],
    ~trustedCidrs=["10.0.0.0/8"],
  )
  assertion(
    ~message="peer in allowlist → XFF honored",
    ~operator="=",
    (a, b) => a == b,
    result,
    "10.0.0.5",
  )
})

test("peer IN trustedCidrs, multiple XFF hops → returns first (leftmost) XFF", () => {
  let result = Ip.resolveClientIp(
    ~peer="10.0.0.1",
    ~xff=["10.0.0.5", "192.168.1.1"],
    ~trustedCidrs=["10.0.0.0/8"],
  )
  assertion(
    ~message="first XFF entry is returned",
    ~operator="=",
    (a, b) => a == b,
    result,
    "10.0.0.5",
  )
})

test("peer NOT in trustedCidrs, empty XFF → returns peer", () => {
  let result = Ip.resolveClientIp(
    ~peer="203.0.113.50",
    ~xff=[""],
    ~trustedCidrs=["10.0.0.0/8"],
  )
  assertion(
    ~message="empty XFF → returns peer",
    ~operator="=",
    (a, b) => a == b,
    result,
    "203.0.113.50",
  )
})

test("peer NOT in trustedCidrs, no XFF header → returns peer", () => {
  let result = Ip.resolveClientIp(
    ~peer="203.0.113.50",
    ~xff=[],
    ~trustedCidrs=["10.0.0.0/8"],
  )
  assertion(
    ~message="no XFF header → returns peer",
    ~operator="=",
    (a, b) => a == b,
    result,
    "203.0.113.50",
  )
})

test("peer is IPv6 in IPv6 CIDR → returns XFF", () => {
  let result = Ip.resolveClientIp(
    ~peer="::1",
    ~xff=["fd00::1"],
    ~trustedCidrs=["::1/128"],
  )
  assertion(
    ~message="IPv6 peer in CIDR → XFF honored",
    ~operator="=",
    (a, b) => a == b,
    result,
    "fd00::1",
  )
})

test("peer is IPv6 NOT in CIDR → returns peer", () => {
  let result = Ip.resolveClientIp(
    ~peer="::1",
    ~xff=["fd00::1"],
    ~trustedCidrs=["fd00::/8"],
  )
  assertion(
    ~message="IPv6 peer not in CIDR → XFF ignored",
    ~operator="=",
    (a, b) => a == b,
    result,
    "::1",
  )
})
