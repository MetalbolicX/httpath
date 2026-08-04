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
  let limiter = RateLimit.make(~maxReq=100, ~windowMs=60000, ~now=() => 0.0)
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
  let limiter = RateLimit.make(~maxReq=100, ~windowMs=60000, ~now=fakeClock)
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
  let limiter = RateLimit.make(~maxReq=100, ~windowMs=60000, ~now=fakeClock)
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
  let limiter = RateLimit.make(~maxReq=5, ~windowMs=1000, ~now=fakeClock)
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
  let limiter = RateLimit.make(~maxReq=100, ~windowMs=60000, ~now=fakeClock)
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
  let limiter = RateLimit.make(~maxReq=5, ~windowMs=60000, ~now=fakeClock)
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
  let limiter = RateLimit.make(~maxReq=5, ~windowMs=1000, ~now=fakeClock)
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
  let limiter = RateLimit.make(~maxReq=2, ~windowMs=1000, ~now=fakeClock)
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
