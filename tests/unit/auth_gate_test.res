// tests/unit/auth_gate_test.res — unit tests for the AuthGate lockout state machine.

open Test

type clock = {
  now: ref<float>,
  read: unit => float,
}

// Mutable clock so each test can advance time without coupling to wall-clock.
let makeClock = (start: float): clock => {
  let now = ref(start)
  {now, read: () => now.contents}
}

let assertDecision = (label: string, actual: AuthGate.decision, expected: AuthGate.decision) => {
  switch (actual, expected) {
  | (AuthGate.Allow, AuthGate.Allow) =>
    assertion(~message=`${label}: both Allow`, ~operator="=", (a, b) => a == b, true, true)
  | (AuthGate.Locked(a), AuthGate.Locked(b)) =>
    assertion(
      ~message=`${label}: Locked retryAfterSeconds`,
      ~operator="=",
      (a, b) => a == b,
      a.retryAfterSeconds,
      b.retryAfterSeconds,
    )
  | (AuthGate.Allow, AuthGate.Locked(_)) =>
    JsError.throwWithMessage(`${label}: expected Locked, got Allow`)
  | (AuthGate.Locked(_), AuthGate.Allow) =>
    JsError.throwWithMessage(`${label}: expected Allow, got Locked`)
  }
}

// ---------------------------------------------------------------------------
// Test 1: first N-1 failures → Allow (no lockout yet)
// ---------------------------------------------------------------------------

test("AuthGate: failures below threshold → check returns Allow", () => {
  let clk = makeClock(1000.0)
  let gate = AuthGate.make(~maxFailures=3, ~baseLockoutMs=30000.0, ~now=clk.read)
  AuthGate.recordFailure(gate, "1.2.3.4")
  AuthGate.recordFailure(gate, "1.2.3.4")
  assertDecision("after 2 failures (threshold=3)", AuthGate.check(gate, "1.2.3.4"), AuthGate.Allow)
})

// ---------------------------------------------------------------------------
// Test 2: Nth failure → Locked with ~30s remaining
// ---------------------------------------------------------------------------

test("AuthGate: failures reach threshold → check returns Locked (~30s)", () => {
  let clk = makeClock(1000.0)
  let gate = AuthGate.make(~maxFailures=3, ~baseLockoutMs=30000.0, ~now=clk.read)
  AuthGate.recordFailure(gate, "1.2.3.4")
  AuthGate.recordFailure(gate, "1.2.3.4")
  AuthGate.recordFailure(gate, "1.2.3.4")
  assertDecision("after 3rd failure", AuthGate.check(gate, "1.2.3.4"), AuthGate.Locked({retryAfterSeconds: 30}))
})

// ---------------------------------------------------------------------------
// Test 3: after lockout expires → Allow
// ---------------------------------------------------------------------------

test("AuthGate: after lockout expires → check returns Allow", () => {
  let clk = makeClock(1000.0)
  let gate = AuthGate.make(~maxFailures=3, ~baseLockoutMs=30000.0, ~now=clk.read)
  AuthGate.recordFailure(gate, "1.2.3.4")
  AuthGate.recordFailure(gate, "1.2.3.4")
  AuthGate.recordFailure(gate, "1.2.3.4")
  // Advance clock past the 30s lockout (1000 + 30000 + 1000 = 32000).
  clk.now := clk.now.contents +. 31000.0
  assertDecision("after lockout expires", AuthGate.check(gate, "1.2.3.4"), AuthGate.Allow)
})

// ---------------------------------------------------------------------------
// Test 4: failure after lockout-expired sequence → lockout doubles (~60s)
// ---------------------------------------------------------------------------

test("AuthGate: failure after lockout-expired sequence → lockout doubles to ~60s", () => {
  let clk = makeClock(1000.0)
  let gate = AuthGate.make(~maxFailures=3, ~baseLockoutMs=30000.0, ~now=clk.read)
  AuthGate.recordFailure(gate, "1.2.3.4")
  AuthGate.recordFailure(gate, "1.2.3.4")
  AuthGate.recordFailure(gate, "1.2.3.4")
  // Past the first lockout.
  clk.now := clk.now.contents +. 31000.0
  // One more failure (failures is now 4 → extraFailures=1 → duration=2*30s=60s).
  AuthGate.recordFailure(gate, "1.2.3.4")
  assertDecision(
    "after 4th failure (doubled)",
    AuthGate.check(gate, "1.2.3.4"),
    AuthGate.Locked({retryAfterSeconds: 60}),
  )
})

// ---------------------------------------------------------------------------
// Test 5: recordSuccess resets counter
// ---------------------------------------------------------------------------

test("AuthGate: recordSuccess resets the counter to zero", () => {
  let clk = makeClock(1000.0)
  let gate = AuthGate.make(~maxFailures=3, ~baseLockoutMs=30000.0, ~now=clk.read)
  AuthGate.recordFailure(gate, "1.2.3.4")
  AuthGate.recordFailure(gate, "1.2.3.4")
  AuthGate.recordSuccess(gate, "1.2.3.4")
  // Two more failures should NOT lock (counter was reset to 0).
  AuthGate.recordFailure(gate, "1.2.3.4")
  AuthGate.recordFailure(gate, "1.2.3.4")
  assertDecision("after success reset", AuthGate.check(gate, "1.2.3.4"), AuthGate.Allow)
})

// ---------------------------------------------------------------------------
// Test 6: two different IPs are tracked independently
// ---------------------------------------------------------------------------

test("AuthGate: two different IPs are tracked independently", () => {
  let clk = makeClock(1000.0)
  let gate = AuthGate.make(~maxFailures=2, ~baseLockoutMs=30000.0, ~now=clk.read)
  // Lock 1.2.3.4
  AuthGate.recordFailure(gate, "1.2.3.4")
  AuthGate.recordFailure(gate, "1.2.3.4")
  assertDecision("1.2.3.4 locked", AuthGate.check(gate, "1.2.3.4"), AuthGate.Locked({retryAfterSeconds: 30}))
  // 5.6.7.8 has only 1 failure — still allowed.
  AuthGate.recordFailure(gate, "5.6.7.8")
  assertDecision("5.6.7.8 still allowed", AuthGate.check(gate, "5.6.7.8"), AuthGate.Allow)
})

// ---------------------------------------------------------------------------
// Test 7: maxFailures=0 disables throttling entirely
// ---------------------------------------------------------------------------

test("AuthGate: maxFailures=0 disables throttling (never locks)", () => {
  let clk = makeClock(1000.0)
  let gate = AuthGate.make(~maxFailures=0, ~baseLockoutMs=30000.0, ~now=clk.read)
  AuthGate.recordFailure(gate, "1.2.3.4")
  AuthGate.recordFailure(gate, "1.2.3.4")
  AuthGate.recordFailure(gate, "1.2.3.4")
  AuthGate.recordFailure(gate, "1.2.3.4")
  AuthGate.recordFailure(gate, "1.2.3.4")
  AuthGate.recordFailure(gate, "1.2.3.4")
  assertDecision("never locked when disabled", AuthGate.check(gate, "1.2.3.4"), AuthGate.Allow)
})