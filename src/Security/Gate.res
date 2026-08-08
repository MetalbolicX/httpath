// Security/Gate — pure rate-limit + auth decision for incoming HTTP/WS requests.
// Returns a `gateDecision` describing whether the request is allowed or rejected
// and (on rejection) the exact status, headers, and JSON body the caller should
// emit. This module is pure: it does not write to sockets, log, or read I/O.
// The two callers in Http.res (gate, gateWs) are thin adapters translating the
// decision into either a return value or a raw socket write.

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
): gateDecision => {
  // Auth exemption: exact probe paths /healthz and /readyz bypass auth
  // (rate-limit still applies; probes reveal only "up/draining", not content)
  let isProbe = req.path == "/healthz" || req.path == "/readyz"

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

  // Auth check — skipped for exact probe paths (rate-limit still applies above)
  switch rateDecision {
  | Rejected(_) => rateDecision // already rejected by rate-limit
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
        | Found(_) => Allowed
        | MissingHeader =>
          Rejected({
            status: 401,
            headers: [("WWW-Authenticate", `Basic realm="httpath"`)],
            body: `{"error":"Authentication required"}`,
            reason: "auth_required",
          })
        | WrongCredentials =>
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
