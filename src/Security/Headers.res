// Headers.res — eight HTTP security headers and helper per REQ-HEADERS-1..2.
// Faithful port of src/security/headers.mts (x-content-type-options through CSP).

// ---------------------------------------------------------------------------
// REQ-HEADERS-1: eight security headers constant
// ---------------------------------------------------------------------------

// x-content-type-options: nosniff
// x-frame-options: DENY
// referrer-policy: no-referrer
// permissions-policy: camera=(), microphone=(), geolocation=()
// cross-origin-opener-policy: same-origin
// cross-origin-resource-policy: same-origin
// x-permitted-cross-domain-policies: none
// content-security-policy: default-src 'self'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src 'self' data:
let securityHeaders: array<(string, string)> = [
  ("x-content-type-options", "nosniff"),
  ("x-frame-options", "DENY"),
  ("referrer-policy", "no-referrer"),
  ("permissions-policy", "camera=(), microphone=(), geolocation=()"),
  ("cross-origin-opener-policy", "same-origin"),
  ("cross-origin-resource-policy", "same-origin"),
  ("x-permitted-cross-domain-policies", "none"),
  (
    "content-security-policy",
    "default-src 'self'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src 'self' data:",
  ),
]

// HSTS — only emitted when TLS is active (not part of the static set).
let hstsHeader: (string, string) = (
  "strict-transport-security",
  "max-age=31536000; includeSubDomains",
)

// ---------------------------------------------------------------------------
// REQ-HEADERS-2: withSecurityHeaders appends all eight to any existing headers
// ---------------------------------------------------------------------------

// True when name is one of the eight security header keys.
let isSecurityHeaderKey = (name: string): bool => {
  name == "x-content-type-options" ||
  name == "x-frame-options" ||
  name == "referrer-policy" ||
  name == "permissions-policy" ||
  name == "cross-origin-opener-policy" ||
  name == "cross-origin-resource-policy" ||
  name == "x-permitted-cross-domain-policies" ||
  name == "content-security-policy"
}

let withSecurityHeaders = (~cspOverride: option<string>=?, existing: array<(string, string)>): array<(string, string)> => {
  // Filter out any pre-existing security headers before appending the full set.
  // This avoids duplication when called on a response that already contains them.
  let filtered = existing->Array.filter(((name, _)) => !isSecurityHeaderKey(name))
  switch cspOverride {
  | Some(csp) =>
    let base = Array.concat(filtered, securityHeaders)
    let filteredBase = base->Array.filter(((name, _)) => name != "content-security-policy")
    Array.concat(filteredBase, [("content-security-policy", csp)])
  | None => Array.concat(filtered, securityHeaders)
  }
}
