// tests/unit/security/gate_allowlist_test.res — unit tests for the IP allowlist
// decision in Security/Gate.evaluateGate (plan 039).
// The allowlist runs first; empty allowCidrs allows all (no regression).

open Test

let makeConfig = (~allowCidrs: array<string>): Config.t => {
  ...Config.default,
  allowCidrs,
}

let reqFor = (path: string): Types.request => {
  method: "GET",
  path,
  headers: [],
  clientIp: "192.168.1.1",
  requestId: "allowlist-req",
}

test("Gate.evaluateGate: empty allowCidrs → Allowed (no regression)", () => {
  let config = makeConfig(~allowCidrs=[])
  let req = reqFor("/")
  let result = Gate.evaluateGate(
    ~config,
    ~authEntries=None,
    ~rateLimiter=None,
    ~clientIp="192.168.1.1",
    ~req,
    ~authGate=None,
  )
  switch result {
  | Gate.Allowed => ()
  | Gate.Rejected(_) => JsError.throwWithMessage("empty allowCidrs must allow")
  }
})

test("Gate.evaluateGate: matching CIDR → Allowed", () => {
  let config = makeConfig(~allowCidrs=["192.168.1.0/24"])
  let req = reqFor("/")
  let result = Gate.evaluateGate(
    ~config,
    ~authEntries=None,
    ~rateLimiter=None,
    ~clientIp="192.168.1.42",
    ~req,
    ~authGate=None,
  )
  switch result {
  | Gate.Allowed => ()
  | Gate.Rejected(_) => JsError.throwWithMessage("matching CIDR must allow")
  }
})

test("Gate.evaluateGate: non-matching CIDR → Rejected status=403 reason=ip_not_allowed", () => {
  let config = makeConfig(~allowCidrs=["10.0.0.0/8"])
  let req = reqFor("/")
  let result = Gate.evaluateGate(
    ~config,
    ~authEntries=None,
    ~rateLimiter=None,
    ~clientIp="192.168.1.42",
    ~req,
    ~authGate=None,
  )
  switch result {
  | Gate.Allowed => JsError.throwWithMessage("non-matching CIDR must reject")
  | Gate.Rejected({status, reason}) =>
    assertion(~message="status is 403", ~operator="=", (a, b) => a == b, status, 403)
    assertion(~message="reason is ip_not_allowed", ~operator="=", (a, b) => a == b, reason, "ip_not_allowed")
  }
})

test("Gate.evaluateGate: multi-CIDR list, second entry matches → Allowed", () => {
  let config = makeConfig(~allowCidrs=["10.0.0.0/8", "192.168.1.0/24", "172.16.0.0/12"])
  let req = reqFor("/")
  let result = Gate.evaluateGate(
    ~config,
    ~authEntries=None,
    ~rateLimiter=None,
    ~clientIp="192.168.1.42",
    ~req,
    ~authGate=None,
  )
  switch result {
  | Gate.Allowed => ()
  | Gate.Rejected(_) => JsError.throwWithMessage("second CIDR entry should match")
  }
})

test("Gate.evaluateGate: /32 exact match → Allowed", () => {
  let config = makeConfig(~allowCidrs=["203.0.113.7/32"])
  let req = reqFor("/")
  let result = Gate.evaluateGate(
    ~config,
    ~authEntries=None,
    ~rateLimiter=None,
    ~clientIp="203.0.113.7",
    ~req,
    ~authGate=None,
  )
  switch result {
  | Gate.Allowed => ()
  | Gate.Rejected(_) => JsError.throwWithMessage("exact /32 should match")
  }
})

test("Gate.evaluateGate: rejection shape — status=403, body={\"error\":\"IP not allowed\"}, reason=ip_not_allowed", () => {
  let config = makeConfig(~allowCidrs=["10.0.0.0/8"])
  let req = reqFor("/")
  let result = Gate.evaluateGate(
    ~config,
    ~authEntries=None,
    ~rateLimiter=None,
    ~clientIp="192.168.1.42",
    ~req,
    ~authGate=None,
  )
  switch result {
  | Gate.Allowed => JsError.throwWithMessage("expected Rejected")
  | Gate.Rejected({status, headers, body, reason}) =>
    assertion(~message="status is 403", ~operator="=", (a, b) => a == b, status, 403)
    assertion(
      ~message="body is IP not allowed JSON",
      ~operator="=",
      (a, b) => a == b,
      body,
      `{"error":"IP not allowed"}`,
    )
    assertion(~message="reason is ip_not_allowed", ~operator="=", (a, b) => a == b, reason, "ip_not_allowed")
    assertion(
      ~message="headers has no entries",
      ~operator="=",
      (a, b) => a == b,
      Array.length(headers),
      0,
    )
  }
})
