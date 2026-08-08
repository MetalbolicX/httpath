// src/Security/AuthGate.res — per-IP auth-failure tracker with exponential backoff.
// After maxFailures consecutive failures, the IP is locked for baseLockoutMs.
// Each subsequent failure doubles the lockout duration (capped at maxLockoutMs).
// Pure module: no I/O. Caller threads time via ~now.

module Map = Belt.Map.String

type authState = {
  failures: int,
  lockedUntil: float,
}

type decision =
  | Allow
  | Locked({retryAfterSeconds: int})

type t = {
  mutable state: Map.t<authState>,
  maxFailures: int,
  baseLockoutMs: float,
  maxLockoutMs: float,
  maxIps: int,
  now: unit => float,
}

let make = (
  ~maxFailures: int=5,
  ~baseLockoutMs: float=30000.0,
  ~maxLockoutMs: float=1800000.0,
  ~maxIps: int=0,
  ~now: unit => float,
): t => {
  state: Map.empty,
  maxFailures,
  baseLockoutMs,
  maxLockoutMs,
  maxIps,
  now,
}

// ceilMsToSeconds — round milliseconds up to whole seconds, minimum 1.
let ceilMsToSeconds = (ms: float): int => {
  let s = ms /. 1000.0
  let asInt = Float.toInt(s)
  if Int.toFloat(asInt) == s {
    if asInt < 1 {
      1
    } else {
      asInt
    }
  } else if asInt + 1 < 1 {
    1
  } else {
    asInt + 1
  }
}

let check = (gate: t, ip: string): decision => {
  let currentTime = gate.now()
  switch Map.get(gate.state, ip) {
  | None => Allow
  | Some({lockedUntil}) =>
    if lockedUntil > currentTime {
      let remaining = lockedUntil -. currentTime
      Locked({retryAfterSeconds: ceilMsToSeconds(remaining)})
    } else {
      Allow
    }
  }
}

// pow2 — 2^n as float. Recursive; n is bounded by failure count (small).
let rec pow2 = (n: int): float =>
  if n <= 0 {
    1.0
  } else {
    2.0 *. pow2(n - 1)
  }

// evictOldest — drop the entry with the smallest lockedUntil (oldest lockout)
// to make room when the IP map is full.
let evictOldest = (gate: t): unit => {
  let oldest: ref<option<(string, float)>> = ref(None)
  Map.forEach(gate.state, (k, v) => {
    switch oldest.contents {
    | None => oldest := Some((k, v.lockedUntil))
    | Some((_, lockedUntil)) =>
      if v.lockedUntil < lockedUntil {
        oldest := Some((k, v.lockedUntil))
      }
    }
  })
  switch oldest.contents {
  | Some((ip, _)) => gate.state = Map.remove(gate.state, ip)
  | None => ()
  }
}

let recordFailure = (gate: t, ip: string): unit => {
  if gate.maxFailures <= 0 {
    ()
  } else {
    let currentTime = gate.now()
    let existing = Map.get(gate.state, ip)
    let newFailures = switch existing {
    | Some({failures}) => failures + 1
    | None => 1
    }
    let newLockedUntil: float = if newFailures >= gate.maxFailures {
      let extraFailures = newFailures - gate.maxFailures
      let multiplier = pow2(extraFailures)
      let duration = gate.baseLockoutMs *. multiplier
      let capped = if duration > gate.maxLockoutMs {
        gate.maxLockoutMs
      } else {
        duration
      }
      currentTime +. capped
    } else {
      switch existing {
      | Some({lockedUntil}) => lockedUntil
      | None => 0.0
      }
    }
    // Eviction: only when adding a brand-new IP and the map is at the cap.
    if gate.maxIps > 0 && existing == None && Map.size(gate.state) >= gate.maxIps {
      evictOldest(gate)
    }
    gate.state = Map.set(gate.state, ip, {failures: newFailures, lockedUntil: newLockedUntil})
  }
}

let recordSuccess = (gate: t, ip: string): unit => {
  switch Map.get(gate.state, ip) {
  | Some(_) => gate.state = Map.remove(gate.state, ip)
  | None => ()
  }
}