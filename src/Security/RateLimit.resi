// src/Security/RateLimit.resi — sliding-window rate limiter interface.

type ipState = {
  count: int,
  windowStart: float,
}

type decision =
  | Allow
  | Reject({retryAfterSeconds: int})

type t

let make: (~maxReq: int, ~windowMs: int, ~now: unit => float) => t
let tick: (t, string) => decision
