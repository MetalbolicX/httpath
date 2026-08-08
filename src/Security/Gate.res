// Security/Gate — pure rate-limit + auth decision for incoming HTTP/WS requests.
// Returns a `gateDecision` describing whether the request is allowed or rejected
// and (on rejection) the exact status, headers, and JSON body the caller should
// emit. This module is pure: it does not write to sockets, log, or read I/O.
// The two callers in Http.res (gate, gateWs) are thin adapters translating the
// decision into either a return value or a raw socket write.

module UHeaders = HttpHeaders

type gateDecision =
  | Allowed
  | Rejected({
      status: int,
      headers: array<(string, string)>,
      body: string,
      reason: string,
    })

// Local copy of Basic.extractCredentials — same tree-shaking rationale as
// Http.res: keep credential decoding near the gate so the security policy and
// its inputs travel together.
@module("../Node/BufferImpl.mjs")
external bufferToString: (Buffer.t, string) => string = "toString"

// extractCredentials result — distinguishes "no header" from "bad credentials"
// so Gate.evaluateGate can set the correct rejection reason.
type extractResult =
  | Found(string) // username on success
  | MissingHeader // Authorization header absent
  | WrongCredentials // header present but username not found or password wrong

let extractCredentials = (
  ~authHeader: option<string>,
  ~entries: array<Basic.entry>,
): extractResult => {
  switch authHeader {
  | None => MissingHeader
  | Some(header) =>
    if !String.startsWith(header, "Basic ") {
      WrongCredentials
    } else {
      let encoded = String.substring(header, ~start=6, ~end=String.length(header))
      let decodedBuf: Buffer.t = try {
        Buffer.fromString(encoded, "base64")
      } catch {
      | _ => Buffer.fromString("", "utf8")
      }
      let decoded = bufferToString(decodedBuf, "utf8")
      let colonPos = Js.String.indexOf(":", decoded)
      if colonPos < 0 {
        WrongCredentials
      } else {
        let username = String.substring(decoded, ~start=0, ~end=colonPos)
        let password = String.substring(decoded, ~start=colonPos + 1, ~end=String.length(decoded))
        switch Basic.findUser(entries, username) {
        | None => WrongCredentials
        | Some(entry) =>
          if Basic.verify(entry, password) {
            Found(username)
          } else {
            WrongCredentials
          }
        }
      }
    }
  }
}

let evaluateGate = (
  ~config: Config.t,
  ~authEntries: option<array<Basic.entry>>,
  ~rateLimiter: option<RateLimit.t>,
  ~clientIp: string,
  ~req: Types.request,
  ~authGate: option<AuthGate.t>,
): gateDecision => {
  // Auth exemption: exact probe paths /healthz and /readyz bypass auth
  // (rate-limit still applies; probes reveal only "up/draining", not content)
  let isProbe = req.path == "/healthz" || req.path == "/readyz"

  // IP allowlist (plan 039): empty allowCidrs means the feature is disabled and
  // every IP is allowed. When set, only matching CIDR ranges pass — runs first
  // so that rate-limit and auth counters are not polluted by rejected probes.
  let allowlistDecision: gateDecision = if Array.length(config.allowCidrs) == 0 {
    Allowed
  } else {
    switch config.allowCidrs->Array.find(cidr => Ip.cidrMatch(clientIp, cidr)) {
    | Some(_) => Allowed
    | None =>
      Rejected({
        status: 403,
        headers: [],
        body: `{"error":"IP not allowed"}`,
        reason: "ip_not_allowed",
      })
    }
  }

  // Rate limit first (cheaper, prevents brute-force on auth)
  let rateDecision: gateDecision = if config.rateLimitEnabled {
    switch rateLimiter {
    | Some(limiter) =>
      switch RateLimit.tick(limiter, clientIp) {
      | RateLimit.Reject({retryAfterSeconds}) =>
        Rejected({
          status: 429,
          headers: [("Retry-After", Int.toString(retryAfterSeconds))],
          body: `{"error":"Too many requests"}`,
          reason: "rate_limit",
        })
      | RateLimit.Allow => Allowed
      }
    | None => Allowed
    }
  } else {
    Allowed
  }

  // Auth-failure throttling (plan 038): runs between rate-limit and auth-verify.
  // When locked, the request is rejected with 429 before password verification.
  let authGateDecision: gateDecision = switch allowlistDecision {
  | Rejected(_) => allowlistDecision
  | Allowed =>
    switch rateDecision {
    | Rejected(_) => rateDecision
    | Allowed =>
      switch authGate {
      | None => Allowed
      | Some(gate) =>
        switch AuthGate.check(gate, clientIp) {
        | AuthGate.Allow => Allowed
        | AuthGate.Locked({retryAfterSeconds}) =>
          Rejected({
            status: 429,
            headers: [("Retry-After", Int.toString(retryAfterSeconds))],
            body: `{"error":"Too many auth failures"}`,
            reason: "auth_lockout",
          })
        }
      }
    }
  }

  // Auth check — skipped for exact probe paths (rate-limit still applies above)
  switch authGateDecision {
  | Rejected(_) => authGateDecision // already rejected by rate-limit or auth-gate
  | Allowed =>
    if isProbe {
      // Auth-exempt: probes reveal only "up/draining", not content
      Allowed
    } else if !config.noAuth {
      // Extract credentials from Authorization header
      let authHeader = Types.getHeader(req.headers, "authorization")
      switch authEntries {
      | None =>
        // No auth file entries available — reject
        Rejected({
          status: 401,
          headers: [("WWW-Authenticate", `Basic realm="httpath"`)],
          body: `{"error":"Authentication required"}`,
          reason: "auth_required",
        })
      | Some(entries) =>
        switch extractCredentials(~authHeader, ~entries) {
        | Found(_) =>
          switch authGate {
          | Some(gate) => AuthGate.recordSuccess(gate, clientIp)
          | None => ()
          }
          Allowed
        | MissingHeader =>
          // Missing header is not a credential failure — don't increment
          // the failure counter (only WrongCredentials records a failure).
          Rejected({
            status: 401,
            headers: [("WWW-Authenticate", `Basic realm="httpath"`)],
            body: `{"error":"Authentication required"}`,
            reason: "auth_required",
          })
        | WrongCredentials =>
          switch authGate {
          | Some(gate) => AuthGate.recordFailure(gate, clientIp)
          | None => ()
          }
          Rejected({
            status: 401,
            headers: [("WWW-Authenticate", `Basic realm="httpath"`)],
            body: `{"error":"Authentication required"}`,
            reason: "invalid_credentials",
          })
        }
      }
    } else {
      Allowed
    }
  }
}

// checkOrigin — CSWSH prevention. Returns Allowed unless both an Origin
// header is present, a Host header is present, and the Origin's host does
// not match the Host header. Missing or unparseable Origin/Host values
// fall through to Allowed (non-browser clients have no Origin to send).
let checkOrigin = (
  ~headers: array<(string, string)>,
  ~host: option<string>,
): gateDecision => {
  switch (UHeaders.get(headers)("origin"), host) {
  | (Some(origin), Some(host)) =>
    switch Origin.extractOriginHost(origin) {
    | Some(originHost) =>
      if originHost == host {
        Allowed
      } else {
        Rejected({
          status: 403,
          headers: [],
          body: `{"error":"Cross-origin WebSocket upgrade rejected"}`,
          reason: "origin_mismatch",
        })
      }
    | None => Allowed
    }
  | (None, _) => Allowed
  | (_, None) => Allowed
  }
}
