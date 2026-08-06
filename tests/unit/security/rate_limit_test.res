// tests/unit/security/rate_limit_test.res — unit tests for Security/RateLimit module.
// Strict TDD: RED tests written first.
// Tests sliding-window rate limiter with fake clock seam.

open Test

// ---------------------------------------------------------------------------
// RateLimit.decision — outcome of a rate-limit tick
// ---------------------------------------------------------------------------

// decision type is defined in src/Security/RateLimit.res

// ---------------------------------------------------------------------------
// RateLimit.make — factory
// ---------------------------------------------------------------------------

test("RateLimit.make creates limiter with given max and window", () => {
  let limiter = RateLimit.make(~maxReq=100, ~windowMs=60000, ~maxIps=0, ~now=() => 0.0)
  // Just ensure it doesn't throw — make returns a t
  switch limiter {
  | _ => () // created successfully
  }
})

// ---------------------------------------------------------------------------
// RateLimit.tick — under threshold: first 100 reqs all Allow
// ---------------------------------------------------------------------------

test("RateLimit.tick returns Allow for first 100 requests from same IP", () => {
  let now = ref(1000.0)
  let fakeClock = () => {
    let t = now.contents
    now.contents = now.contents + 1.0
    t
  }
  let limiter = RateLimit.make(~maxReq=100, ~windowMs=60000, ~maxIps=0, ~now=fakeClock)
  let ip = "192.168.1.1"
  let rec loop = (n: int): bool => {
    if n <= 0 {
      true
    } else {
      switch RateLimit.tick(limiter, ip) {
      | RateLimit.Allow => loop(n - 1)
      | RateLimit.Reject(_) => false
      }
    }
  }
  let result = loop(100)
  assertion(
    ~message="first 100 requests from same IP all return Allow",
    ~operator="=",
    (a, b) => a == b,
    result,
    true,
  )
})

test("RateLimit.tick returns Reject on 101st request from same IP", () => {
  let now = ref(1000.0)
  let fakeClock = () => {
    let t = now.contents
    now.contents = now.contents + 1.0
    t
  }
  let limiter = RateLimit.make(~maxReq=100, ~windowMs=60000, ~maxIps=0, ~now=fakeClock)
  let ip = "192.168.1.1"
  // consume 100 tokens
  let _ = {
    let rec loop = (n: int) => {
      if n <= 0 {
        ()
      } else {
        let _ = RateLimit.tick(limiter, ip)
        loop(n - 1)
      }
    }
    loop(100)
  }
  // 101st should be Reject
  switch RateLimit.tick(limiter, ip) {
  | RateLimit.Allow => JsError.throwWithMessage("101st request should be rejected")
  | RateLimit.Reject(_) => () // expected
  }
})

// ---------------------------------------------------------------------------
// RateLimit.tick — Retry-After on Reject
// ---------------------------------------------------------------------------

test("RateLimit.tick Reject includes retryAfterSeconds > 0", () => {
  let now = ref(1000.0)
  let fakeClock = () => {
    let t = now.contents
    now.contents = now.contents + 1.0
    t
  }
  let limiter = RateLimit.make(~maxReq=5, ~windowMs=1000, ~maxIps=0, ~now=fakeClock)
  let ip = "192.168.1.1"
  // consume 5 tokens
  let _ = {
    let rec loop = (n: int) => {
      if n <= 0 {
        ()
      } else {
        let _ = RateLimit.tick(limiter, ip)
        loop(n - 1)
      }
    }
    loop(5)
  }
  // 6th should be Reject with retryAfterSeconds
  switch RateLimit.tick(limiter, ip) {
  | RateLimit.Allow => JsError.throwWithMessage("6th request should be rejected")
  | RateLimit.Reject({retryAfterSeconds}) =>
    assertion(
      ~message="retryAfterSeconds is positive",
      ~operator=">=",
      (a, b) => a >= b,
      retryAfterSeconds,
      1,
    )
  }
})

// ---------------------------------------------------------------------------
// RateLimit.tick — window expiry resets counter
// ---------------------------------------------------------------------------

test("RateLimit.tick counter resets after window expires", () => {
  let now = ref(1000.0)
  let fakeClock = () => {
    let t = now.contents
    now.contents = now.contents + 100.0 // advance 100ms per call
    t
  }
  let limiter = RateLimit.make(~maxReq=100, ~windowMs=60000, ~maxIps=0, ~now=fakeClock)
  let ip = "192.168.1.1"
  // consume 100 tokens
  let _ = {
    let rec loop = (n: int) => {
      if n <= 0 {
        ()
      } else {
        let _ = RateLimit.tick(limiter, ip)
        loop(n - 1)
      }
    }
    loop(100)
  }
  // Now advance time past the window (windowMs = 60000, we've advanced ~10000ms total from calls)
  // We need to get now - windowStart > windowMs to trigger reset
  // Simulate: advance time way past the window
  now.contents = 1000.0 + 70000.0 // now is 71000, windowStart was ~1000, diff = 70000 > 60000
  // The next tick should reset the window and return Allow
  switch RateLimit.tick(limiter, ip) {
  | RateLimit.Allow => () // window reset, allowed
  | RateLimit.Reject(_) => JsError.throwWithMessage("request should be allowed after window expires")
  }
})

// ---------------------------------------------------------------------------
// RateLimit.tick — per-IP independent counters
// ---------------------------------------------------------------------------

test("RateLimit.tick IP A at limit does not affect IP B", () => {
  let now = ref(1000.0)
  let fakeClock = () => {
    let t = now.contents
    now.contents = now.contents + 1.0
    t
  }
  let limiter = RateLimit.make(~maxReq=5, ~windowMs=60000, ~maxIps=0, ~now=fakeClock)
  let ipA = "192.168.1.1"
  let ipB = "192.168.1.2"
  // exhaust ipA's quota
  let _ = {
    let rec loop = (n: int) => {
      if n <= 0 {
        ()
      } else {
        let _ = RateLimit.tick(limiter, ipA)
        loop(n - 1)
      }
    }
    loop(5)
  }
  // ipA is rejected
  switch RateLimit.tick(limiter, ipA) {
  | RateLimit.Allow => JsError.throwWithMessage("ipA should be rejected")
  | RateLimit.Reject(_) => () // expected
  }
  // ipB should still be allowed (hasn't sent any requests)
  switch RateLimit.tick(limiter, ipB) {
  | RateLimit.Allow => () // expected
  | RateLimit.Reject(_) => JsError.throwWithMessage("ipB should NOT be affected by ipA limit")
  }
})

// ---------------------------------------------------------------------------
// RateLimit.tick — custom max and window via make
// ---------------------------------------------------------------------------

test("RateLimit.tick with max=5 windowMs=1000: 5 Allow then Reject", () => {
  let now = ref(0.0)
  let fakeClock = () => {
    let t = now.contents
    now.contents = now.contents + 1.0
    t
  }
  let limiter = RateLimit.make(~maxReq=5, ~windowMs=1000, ~maxIps=0, ~now=fakeClock)
  let ip = "10.0.0.1"
  let rec loop = (n: int): bool => {
    if n <= 0 {
      true
    } else {
      switch RateLimit.tick(limiter, ip) {
      | RateLimit.Allow => loop(n - 1)
      | RateLimit.Reject(_) => false
      }
    }
  }
  // 5 requests should all be Allow
  let first5 = loop(5)
  assertion(
    ~message="first 5 custom-limit requests are Allow",
    ~operator="=",
    (a, b) => a == b,
    first5,
    true,
  )
  // 6th should be Reject
  switch RateLimit.tick(limiter, ip) {
  | RateLimit.Allow => JsError.throwWithMessage("6th custom-limit request should be rejected")
  | RateLimit.Reject(_) => () // expected
  }
})

// ---------------------------------------------------------------------------
// RateLimit.tick — Retry-After is ceil of remaining window time in seconds
// ---------------------------------------------------------------------------

test("RateLimit.tick Reject retryAfterSeconds equals ceil((windowStart + windowMs - now) / 1000)", () => {
  let now = ref(1000.0)
  let fakeClock = () => {
    let t = now.contents
    now.contents = now.contents + 100.0
    t
  }
  let limiter = RateLimit.make(~maxReq=2, ~windowMs=1000, ~maxIps=0, ~now=fakeClock)
  let ip = "192.168.1.1"
  // consume 2 tokens — windowStart set at ~1000
  let _ = RateLimit.tick(limiter, ip)
  let _ = RateLimit.tick(limiter, ip)
  // now is ~1200, windowStart=1000, windowMs=1000, remaining = 1000 - 200 = 800ms => ceil(0.8) = 1s
  // Actually with our fakeClock, now=100,200 after ticks... let me recalculate
  // after 2 ticks: now.contents = 300
  // windowStart = 100 (first tick), remaining = 1000 - (300-100) = 800ms => 1 second
  switch RateLimit.tick(limiter, ip) {
  | RateLimit.Allow => JsError.throwWithMessage("3rd request should be rejected")
  | RateLimit.Reject({retryAfterSeconds}) =>
    // With our fakeClock advancing 100ms per tick:
    // tick1: now=100, windowStart=100, count=1
    // tick2: now=200, windowStart=100, count=2
    // tick3: now=300, windowStart=100, windowMs=1000, remaining = 800ms => ceil(0.8) = 1
    assertion(
      ~message="retryAfterSeconds is 1 (ceiling of 800ms)",
      ~operator="=",
      (a, b) => a == b,
      retryAfterSeconds,
      1,
    )
  }
})

// ---------------------------------------------------------------------------
// RateLimit.sweepExpired — removes entries whose window has expired
// ---------------------------------------------------------------------------

test("RateLimit.sweepExpired removes an IP whose windowStart is older than windowMs", () => {
  let now = ref(1000.0)
  let fakeClock = () => {
    let t = now.contents
    now.contents = now.contents +. 1.0
    t
  }
  let limiter = RateLimit.make(~maxReq=10, ~windowMs=5000, ~maxIps=100, ~now=fakeClock)
  // IP "a" at t=1000 (windowStart=1000), then advance to t=7000 — window expired
  let _ = RateLimit.tick(limiter, "a")
  now.contents = 1000.0 +. 7000.0 // t=8000, diff=7000 > 5000 window
  let removed = RateLimit.sweepExpired(limiter)
  assertion(
    ~message="sweepExpired returns 1 removed",
    ~operator="=",
    (a, b) => a == b,
    removed,
    1,
  )
  // Evicted IP gets fresh treatment on next request
  let d = RateLimit.tick(limiter, "a")
  let isAllow = switch d {
  | RateLimit.Allow => true
  | RateLimit.Reject(_) => false
  }
  assertion(~message="evicted IP treated as fresh after sweep", ~operator="=", (a, b) => a == b, isAllow, true)
})

test("RateLimit.sweepExpired keeps within-window IPs", () => {
  let now = ref(1000.0)
  let fakeClock = () => {
    let t = now.contents
    now.contents = now.contents +. 1.0
    t
  }
  let limiter = RateLimit.make(~maxReq=10, ~windowMs=5000, ~maxIps=100, ~now=fakeClock)
  let _ = RateLimit.tick(limiter, "a") // windowStart=1000
  now.contents = 1000.0 +. 2000.0 // t=3000, diff=2000 < 5000, still in window
  let removed = RateLimit.sweepExpired(limiter)
  assertion(
    ~message="sweepExpired returns 0 for in-window IP",
    ~operator="=",
    (a, b) => a == b,
    removed,
    0,
  )
  // Still tracked — second request within window increments count
  let d = RateLimit.tick(limiter, "a")
  let isAllow = switch d {
  | RateLimit.Allow => true
  | RateLimit.Reject(_) => false
  }
  assertion(~message="in-window IP still tracked", ~operator="=", (a, b) => a == b, isAllow, true)
})

// ---------------------------------------------------------------------------
// RateLimit.tick — over-cap eviction
// ---------------------------------------------------------------------------

test("RateLimit.tick when Map.size >= maxIps evicts the oldest-by-windowStart IP", () => {
  let now = ref(100.0)
  let fakeClock = () => {
    let t = now.contents
    now.contents = now.contents +. 50.0
    t
  }
  let limiter = RateLimit.make(~maxReq=10, ~windowMs=5000, ~maxIps=3, ~now=fakeClock)
  // Fill to capacity: 3 IPs at different windowStart times
  let _ = RateLimit.tick(limiter, "a") // windowStart=100
  let _ = RateLimit.tick(limiter, "b") // windowStart=150
  let _ = RateLimit.tick(limiter, "c") // windowStart=200
  // Map is full. New IP "d" at t=300 should evict "a" (oldest, windowStart=100)
  let _ = RateLimit.tick(limiter, "d")
  let sz = RateLimit.size(limiter)
  assertion(
    ~message="map size stays at maxIps after eviction",
    ~operator="=",
    (a, b) => a == b,
    sz,
    3,
  )
  // "a" evicted: next request is fresh (count=1, Allow)
  let d = RateLimit.tick(limiter, "a")
  let isAllow = switch d {
  | RateLimit.Allow => true
  | RateLimit.Reject(_) => false
  }
  assertion(~message="evicted IP's first new request is Allow", ~operator="=", (a, b) => a == b, isAllow, true)
})

test("RateLimit.tick eviction does NOT reject the new IP on its first request (count starts at 1)", () => {
  let now = ref(0.0)
  let fakeClock = () => {
    let t = now.contents
    now.contents = now.contents +. 1.0
    t
  }
  let limiter = RateLimit.make(~maxReq=2, ~windowMs=5000, ~maxIps=2, ~now=fakeClock)
  let _ = RateLimit.tick(limiter, "a") // count=1, Allow
  let _ = RateLimit.tick(limiter, "a") // count=2, Allow
  // Map full. New IP "b" triggers eviction of "a".
  let d = RateLimit.tick(limiter, "b")
  let isAllow = switch d {
  | RateLimit.Allow => true
  | RateLimit.Reject(_) => false
  }
  assertion(
    ~message="new IP after eviction is Allowed (count=1)",
    ~operator="=",
    (a, b) => a == b,
    isAllow,
    true,
  )
})

test("RateLimit.tick after eviction, evicted IP's next request is treated as fresh", () => {
  let now = ref(0.0)
  let fakeClock = () => {
    let t = now.contents
    now.contents = now.contents +. 1.0
    t
  }
  let limiter = RateLimit.make(~maxReq=1, ~windowMs=5000, ~maxIps=1, ~now=fakeClock)
  let d1 = RateLimit.tick(limiter, "a") // count=1, Allow
  let firstIsAllow = switch d1 {
  | RateLimit.Allow => true
  | RateLimit.Reject(_) => false
  }
  assertion(~message="first request for 'a' is Allow", ~operator="=", (a, b) => a == b, firstIsAllow, true)
  // Second request from 'a' is rejected (over limit)
  let d2 = RateLimit.tick(limiter, "a")
  let secondIsReject = switch d2 {
  | RateLimit.Allow => false
  | RateLimit.Reject(_) => true
  }
  assertion(~message="second request for 'a' is Reject (over limit)", ~operator="=", (a, b) => a == b, secondIsReject, true)
  // New IP "b" arrives — evicts "a"
  let d3 = RateLimit.tick(limiter, "b")
  let thirdIsAllow = switch d3 {
  | RateLimit.Allow => true
  | RateLimit.Reject(_) => false
  }
  assertion(~message="'b' is Allow after evicting 'a'", ~operator="=", (a, b) => a == b, thirdIsAllow, true)
  // "a" is gone. Next request from "a" is fresh (count=1, Allow)
  let d4 = RateLimit.tick(limiter, "a")
  let fourthIsAllow = switch d4 {
  | RateLimit.Allow => true
  | RateLimit.Reject(_) => false
  }
  assertion(~message="'a' after eviction is fresh (count=1, Allow)", ~operator="=", (a, b) => a == b, fourthIsAllow, true)
})

test("RateLimit.tick maxIps=0 means no cap (backward-compatible default)", () => {
  let now = ref(0.0)
  let fakeClock = () => {
    let t = now.contents
    now.contents = now.contents +. 1.0
    t
  }
  let limiter = RateLimit.make(~maxReq=1, ~windowMs=5000, ~maxIps=0, ~now=fakeClock)
  // Fill more than 10 IPs — no eviction should occur
  let results = Belt.Array.map(Belt.Array.range(0, 15), i => {
    let ip = "ip" ++ Int.toString(i)
    switch RateLimit.tick(limiter, ip) {
    | RateLimit.Allow => 0
    | RateLimit.Reject(_) => 1
    }
  })
  let allowedCount = Belt.Array.reduce(results, 0, (acc, r) => acc + (r == 0 ? 1 : 0))
  assertion(
    ~message="maxIps=0 allows 16 IPs without eviction",
    ~operator="=",
    (a, b) => a == b,
    allowedCount,
    16,
  )
  let sz = RateLimit.size(limiter)
  assertion(
    ~message="maxIps=0 means no map size limit",
    ~operator="=",
    (a, b) => a == b,
    sz,
    16,
  )
})
