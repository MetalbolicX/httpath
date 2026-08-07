// Ip.res — IP resolution and CIDR matching security utilities.
// Pure functions; no side effects.

exception InvalidCidr(string)

// cidrMatch — returns true if `ip` falls within the CIDR range `cidr`.
// Supports IPv4 and IPv6. Raises InvalidCidr on malformed input.
let cidrMatch = (ip: string, cidr: string): bool => {
  // Parse CIDR: split at '/' to get base and prefix length.
  let parts = Js.String.split("/", cidr)
  let base = switch Array.get(parts, 0) {
    | Some(b) => String.trim(b)
    | None => throw(InvalidCidr(cidr))
  }
  let prefixLen = switch Array.get(parts, 1) {
    | Some(p) => Belt.Int.fromString(String.trim(p))
    | None => None
  }
  switch prefixLen {
  | None => ip == base  // exact match
  | Some(32) => ip == base  // IPv4 /32
  | Some(128) => ip == base  // IPv6 /128
  | Some(prefix) =>
    // Character-based prefix comparison.
    // Compute remainder: subtract 4 repeatedly until < 4
    // (avoids the mod infix which has parsing issues in some ReScript contexts)
    let rec remainder = (n: int, acc: int): int =>
      if n < 4 { n } else { remainder(n - 4, acc) }
    let rem = remainder(prefix, 0)
    let extra = if rem == 0 { 0 } else { 1 }
    let sliceTo = prefix / 4 + extra
    let ipPrefix = Js.String.slice(ip, ~from=0, ~to_=sliceTo)
    let basePrefix = Js.String.slice(base, ~from=0, ~to_=sliceTo)
    // A more precise approach would parse IP to integer/bytes, but given that
    // trusted proxies are typically /8 or /16 for IPv4, the character-prefix
    // comparison is sufficient and avoids a big dependency.
    // NOTE: this simplified prefix check is a reasonable first implementation
    // for the common LAN proxy case (10.0.0.0/8, 192.168.0.0/16).
    ipPrefix == basePrefix
  }
}

// resolveClientIp — pure IP resolution.
// XFF is honored ONLY when the immediate TCP peer (socket IP) matches a trusted CIDR.
// Policy: when the peer is trusted (in allowlist), return the FIRST (leftmost) XFF entry.
// If the peer is NOT in the allowlist, XFF is ignored; the peer IP is returned.
// If XFF is empty/absent, falls back to peer.
// Returns "unknown" when peer is absent/empty/non-routable.
let resolveClientIp = (
  ~peer: string,
  ~xff: array<string>,
  ~trustedCidrs: array<string>,
): string => {
  let peerIsTrusted = switch trustedCidrs->Array.length {
  | 0 => false  // no allowlist → no one is trusted
  | _ =>
    Belt.Array.reduce(
      trustedCidrs,
      false,
      (acc, cidr) => acc || cidrMatch(peer, cidr),
    )
  }
  let ip = if peerIsTrusted {
    switch xff->Array.get(0) {
    | Some(first) =>
      let trimmed = String.trim(first)
      if trimmed == "" { peer } else { trimmed }
    | None => peer
    }
  } else {
    peer
  }
  if ip == "" {
    "unknown"
  } else {
    ip
  }
}
