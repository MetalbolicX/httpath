// src/Security/RateLimit.resi — sliding-window rate limiter interface.

type ipState = {
  count: int,
  windowStart: float,
}

type decision =
  | Allow
  | Reject({retryAfterSeconds: int})

type t

let make: (~maxReq: int, ~windowMs: int, ~maxIps: int=?, ~now: unit => float) => t
let tick: (t, string) => decision

// Sweep expired entries from the limiter map.
// Returns the number of entries removed.
let sweepExpired: t => int

// Returns the current number of IPs tracked in the limiter state.
let size: t => int
