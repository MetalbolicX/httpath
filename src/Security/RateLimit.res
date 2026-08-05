// src/Security/RateLimit.res — sliding-window per-IP rate limiter.
// No eviction: restart resets all state. State is in-memory Map only.

module Map = Belt.Map.String

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type ipState = {
  count: int,
  windowStart: float,
}

type decision =
  | Allow
  | Reject({retryAfterSeconds: int})

type t = {
  mutable state: Map.t<ipState>,
  maxReq: int,
  windowMs: int,
  now: unit => float,
}

// ---------------------------------------------------------------------------
// make — constructor
// ---------------------------------------------------------------------------

let make = (~maxReq: int, ~windowMs: int, ~now: unit => float): t => {
  state: Map.empty,
  maxReq,
  windowMs,
  now,
}

// ---------------------------------------------------------------------------
// tick — per-IP sliding-window rate-limit decision
// ---------------------------------------------------------------------------

let tick = (limiter: t, ip: string): decision => {
  let currentTime = limiter.now()
  let existing = Map.get(limiter.state, ip)
  switch existing {
  | None =>
    // First request from this IP: start a new window
    let newState: ipState = {count: 1, windowStart: currentTime}
    limiter.state = Map.set(limiter.state, ip, newState)
    Allow
  | Some({count, windowStart}) =>
    // Check if window has expired: currentTime - windowStart > windowMs
    let elapsed = currentTime -. windowStart
    if elapsed > Int.toFloat(limiter.windowMs) {
      // Window expired: reset with a fresh window
      let newState: ipState = {count: 1, windowStart: currentTime}
      limiter.state = Map.set(limiter.state, ip, newState)
      Allow
    } else if count >= limiter.maxReq {
      // Over threshold: reject with Retry-After
      let remainingMs = Int.toFloat(limiter.windowMs) -. elapsed
      // ceil(remainingMs / 1000.0) for seconds, minimum 1
      let retryAfter = {
        let s = remainingMs /. 1000.0
        // ceil for positive floats: floor + 1 if not already integer
        let asInt = Float.toInt(s)
        if Int.toFloat(asInt) == s {
          if asInt < 1 { 1 } else { asInt }
        } else {
          if asInt + 1 < 1 { 1 } else { asInt + 1 }
        }
      }
      Reject({retryAfterSeconds: retryAfter})
    } else {
      // Under threshold: increment and allow
      let newState: ipState = {count: count + 1, windowStart}
      limiter.state = Map.set(limiter.state, ip, newState)
      Allow
    }
  }
}
