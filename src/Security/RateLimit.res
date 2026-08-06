// src/Security/RateLimit.res — sliding-window per-IP rate limiter.
// Eviction policy: when Map.size >= maxIps and maxIps > 0, the IP with the
// smallest windowStart (oldest entry) is evicted to make room for a new IP.
// Eviction never rejects a new IP's first request — it always starts at count=1.
// A maxIps value of 0 means "no cap" (backward-compatible default).

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
  maxIps: int,
  now: unit => float,
}

// ---------------------------------------------------------------------------
// make — constructor
// ---------------------------------------------------------------------------

let make = (
  ~maxReq: int,
  ~windowMs: int,
  ~maxIps: int=0,
  ~now: unit => float,
): t => {
  state: Map.empty,
  maxReq,
  windowMs,
  maxIps,
  now,
}

// ---------------------------------------------------------------------------
// size — number of IPs currently tracked
// ---------------------------------------------------------------------------

let size = (limiter: t): int => Map.size(limiter.state)

// ---------------------------------------------------------------------------
// sweepExpired — remove entries whose window has expired
// Returns the count of removed entries.
// ---------------------------------------------------------------------------

let sweepExpired = (limiter: t): int => {
  let currentTime = limiter.now()
  let windowMs = limiter.windowMs
  let toRemove: array<string> = []
  Map.forEach(limiter.state, (ip, {windowStart}) => {
    let elapsed = currentTime -. windowStart
    if elapsed > Int.toFloat(windowMs) {
      Belt.Array.push(toRemove, ip)
    }
  })
  let removed = ref(0)
  Belt.Array.forEach(toRemove, ip => {
    limiter.state = Map.remove(limiter.state, ip)
    removed := removed.contents + 1
  })
  removed.contents
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
    // Over-cap eviction: if maxIps > 0 and map is full, evict oldest entry
    if limiter.maxIps > 0 && Map.size(limiter.state) >= limiter.maxIps {
      // Find the entry with the smallest windowStart (oldest)
      let oldest = ref(None)
      Map.forEach(limiter.state, (k, v) => {
        switch oldest.contents {
        | None => oldest := Some((k, v))
        | Some((_, {windowStart: oldestStart})) =>
          if v.windowStart < oldestStart {
            oldest := Some((k, v))
          }
        }
      })
      switch oldest.contents {
      | Some((oldestIp, _)) =>
        limiter.state = Map.remove(limiter.state, oldestIp)
      | None => ()
      }
    }
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
