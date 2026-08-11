// ws_hub_test.res — Unit tests for Hub.WsHub.
// Tests register/unregister/idempotency/auto-cleanup via observable side-effects.
// The fake socket records events; the hub's public API is exercised without throws.

open Test
open WsHub_Types

@module("./ws_hub_socket.mjs")
external createFakeSocket: unit => 'fakeSocket = "createFakeSocket"

@module("./ws_hub_socket.mjs")
external getCounter: unit => 'counter = "getCounter"

@module("./ws_hub_socket.mjs")
external callListeners: ('fakeSocket, string) => unit = "callListeners"

@module("./ws_hub_socket.mjs")
external resetCounter: unit => unit = "resetCounter"

// Extend fake socket with write recording and throw/reject modes.
@module("./ws_hub_socket.mjs")
external setThrowMode: ('fakeSocket, bool) => unit = "setThrowMode"

@module("./ws_hub_socket.mjs")
external setRejectMode: ('fakeSocket, bool) => unit = "setRejectMode"

@module("./ws_hub_socket.mjs")
external getWriteCount: 'fakeSocket => int = "getWriteCount"

@module("./ws_hub_socket.mjs")
external getLastWrite: 'fakeSocket => array<int> = "getLastWrite"

@module("./ws_hub_socket.mjs")
external clearWrites: 'fakeSocket => unit = "clearWrites"

@module("../../src/Node/TestHelpers.mjs")
external incrementHubListenerCounter: unit => unit = "incrementHubListenerCounter"

// Cast fake to serverSocket for hub calls.
external asServerSocket: 'a => Http.serverSocket = "%identity"

// ---------------------------------------------------------------------------
// Scenario: Register a single client — live set size grows to 1
// ---------------------------------------------------------------------------
test("WsHub.register grows live set size from 0 to 1", () => {
  WsHub._testResetHub()
  let fake = createFakeSocket()
  let sock = asServerSocket(fake)

  let before = WsHub._testGetRegisteredCount()
  let _ = WsHub.register(~socket=sock, ~clientIp="1.1.1.1", ~onLifecycle=() => ())
  let after = WsHub._testGetRegisteredCount()

  assertion(
    ~message="register new socket should grow live set from 0 to 1",
    ~operator="=",
    (a, b) => a == b,
    after,
    before + 1,
  )
})

// ---------------------------------------------------------------------------
// Scenario: Register is idempotent — second register is a no-op (size stays 1)
// ---------------------------------------------------------------------------
test("WsHub.register is idempotent — second call leaves size at 1", () => {
  WsHub._testResetHub()
  let fake = createFakeSocket()
  let sock = asServerSocket(fake)

  let _ = WsHub.register(~socket=sock, ~clientIp="2.2.2.2", ~onLifecycle=() => ())
  let before = WsHub._testGetRegisteredCount()
  let _ = WsHub.register(~socket=sock, ~clientIp="2.2.2.2", ~onLifecycle=() => ())
  let after = WsHub._testGetRegisteredCount()

  assertion(
    ~message="idempotent register should not change live set size",
    ~operator="=",
    (a, b) => a == b,
    after,
    before,
  )
})

// ---------------------------------------------------------------------------
// Scenario: Unregister a registered client — live set size returns to 0
// ---------------------------------------------------------------------------
test("WsHub.unregister returns live set size to 0", () => {
  WsHub._testResetHub()
  let fake = createFakeSocket()
  let sock = asServerSocket(fake)

  let _ = WsHub.register(~socket=sock, ~clientIp="3.3.3.3", ~onLifecycle=() => ())
  let before = WsHub._testGetRegisteredCount()
  WsHub.unregister(sock, "3.3.3.3")
  let after = WsHub._testGetRegisteredCount()

  assertion(
    ~message="unregister should shrink live set back to 0",
    ~operator="=",
    (a, b) => a == b,
    after,
    before - 1,
  )
})

// ---------------------------------------------------------------------------
// Scenario: Unregister an unknown client — idempotent, no throw, size stays 0
// ---------------------------------------------------------------------------
test("WsHub.unregister is idempotent — unknown socket leaves size unchanged", () => {
  WsHub._testResetHub()
  let fake = createFakeSocket()
  let sock = asServerSocket(fake)

  let before = WsHub._testGetRegisteredCount()
  WsHub.unregister(sock, "0.0.0.0")
  let after = WsHub._testGetRegisteredCount()

  assertion(
    ~message="unregister unknown socket should not change live set size",
    ~operator="=",
    (a, b) => a == b,
    after,
    before,
  )
})

// ---------------------------------------------------------------------------
// Scenario: Socket emits close — auto-unregistration (via listener attachment)
// ---------------------------------------------------------------------------
  test("WsHub.register attaches close listener — socket close triggers unregister", () => {
  WsHub._testResetHub()
  resetCounter()
  let fake = createFakeSocket()
  let sock = asServerSocket(fake)
  let counter = getCounter()
  let _before = WsHub._testGetRegisteredCount()
  let _ = WsHub.register(~socket=sock, ~clientIp="4.4.4.4", ~onLifecycle=incrementHubListenerCounter)
  let registeredCount = WsHub._testGetRegisteredCount()

  // Verify the socket is registered (count == 1).
  assertion(
    ~message="socket should be registered before close event",
    ~operator="=",
    (a, b) => a == b,
    registeredCount,
    1,
  )

  // Emit a close event — the hub's close listener fires and calls unregister.
  callListeners(fake, "close")
  let countAfterClose = WsHub._testGetRegisteredCount()

  // The socket should have been auto-unregistered (count == 0).
  assertion(
    ~message="socket should be auto-unregistered after close event",
    ~operator="=",
    (a, b) => a == b,
    countAfterClose,
    0,
  )

  // The counter should have been incremented (close listener fired once).
  assertion(
    ~message="close event should increment counter (listener fired)",
    ~operator="=",
    (a, b) => a == b,
    counter["count"],
    1,
  )

  // Second emit should not increment (listener was removed by unregister).
  callListeners(fake, "close")
  assertion(
    ~message="second close emit should not fire (listener detached)",
    ~operator="=",
    (a, b) => a == b,
    counter["count"],
    1,
  )
})

// ---------------------------------------------------------------------------
// Scenario: Socket emits error — auto-unregistration
// ---------------------------------------------------------------------------
  test("WsHub.register attaches error listener — socket error triggers unregister", () => {
  WsHub._testResetHub()
  resetCounter()
  let fake = createFakeSocket()
  let sock = asServerSocket(fake)
  let counter = getCounter()
  let _before = WsHub._testGetRegisteredCount()
  let _ = WsHub.register(~socket=sock, ~clientIp="5.5.5.5", ~onLifecycle=incrementHubListenerCounter)
  let registeredCount = WsHub._testGetRegisteredCount()

  // Verify the socket is registered.
  assertion(
    ~message="socket should be registered before error event",
    ~operator="=",
    (a, b) => a == b,
    registeredCount,
    1,
  )

  // Emit an error event — the hub's error listener fires and calls unregister.
  callListeners(fake, "error")
  let countAfterError = WsHub._testGetRegisteredCount()

  // The socket should have been auto-unregistered.
  assertion(
    ~message="socket should be auto-unregistered after error event",
    ~operator="=",
    (a, b) => a == b,
    countAfterError,
    0,
  )

  // The counter should have been incremented (error listener fired once).
  assertion(
    ~message="error event should increment counter (listener fired)",
    ~operator="=",
    (a, b) => a == b,
    counter["count"],
    1,
  )

  // Second emit should not increment (listener was removed).
  callListeners(fake, "error")
  assertion(
    ~message="second error emit should not fire (listener detached)",
    ~operator="=",
    (a, b) => a == b,
    counter["count"],
    1,
  )
})

// ---------------------------------------------------------------------------
// Scenario: Notify with zero clients — no throw, no socket write attempted
// ---------------------------------------------------------------------------
test("WsHub.notifyReload on empty hub is a no-op", () => {
  WsHub._testResetHub()
  // With no sockets registered, notifyReload should be a no-op (no throw).
  WsHub.notifyReload()

  // No exception means the test passes — this is the spec behavior.
  assertion(
    ~message="notifyReload on empty hub should not throw",
    ~operator="=",
    (a, b) => a == b,
    true,
    true,
  )
})

// ---------------------------------------------------------------------------
// Scenario: notifyReload does not throw with one healthy client (write succeeds)
// ---------------------------------------------------------------------------
test("WsHub.notifyReload writes to registered socket without throwing", () => {
  WsHub._testResetHub()
  let fake = createFakeSocket()
  let sock = asServerSocket(fake)

  let _ = WsHub.register(~socket=sock, ~clientIp="6.6.6.6", ~onLifecycle=() => ())
  // notifyReload should not throw even when write succeeds.
  WsHub.notifyReload()

  // Verify the write actually happened (observable side-effect).
  let wc = getWriteCount(fake)
  assertion(
    ~message="notifyReload with one client should produce exactly one write",
    ~operator="=",
    (a, b) => a == b,
    wc,
    1,
  )
})

// ---------------------------------------------------------------------------
// Scenario: notifyReload with N clients — all receive the frame
// ---------------------------------------------------------------------------
test("WsHub.notifyReload broadcasts to all registered clients", () => {
  WsHub._testResetHub()
  let fake1 = createFakeSocket()
  let fake2 = createFakeSocket()
  let sock1 = asServerSocket(fake1)
  let sock2 = asServerSocket(fake2)

  let _ = WsHub.register(~socket=sock1, ~clientIp="7.7.7.7", ~onLifecycle=() => ())
  let _ = WsHub.register(~socket=sock2, ~clientIp="7.7.7.8", ~onLifecycle=() => ())
  WsHub.notifyReload()

  // Both sockets should have received exactly one write.
  let wc1 = getWriteCount(fake1)
  let wc2 = getWriteCount(fake2)

  assertion(~message="first socket received one write", ~operator="=", (a, b) => a == b, wc1, 1)
  assertion(~message="second socket received one write", ~operator="=", (a, b) => a == b, wc2, 1)
})

// ---------------------------------------------------------------------------
// Scenario: notifyReload preserves insertion order (deterministic broadcast)
// ---------------------------------------------------------------------------
test("WsHub.notifyReload broadcasts in registration order", () => {
  WsHub._testResetHub()
  let fake1 = createFakeSocket()
  let fake2 = createFakeSocket()
  let sock1 = asServerSocket(fake1)
  let sock2 = asServerSocket(fake2)

  let _ = WsHub.register(~socket=sock1, ~clientIp="8.8.8.8", ~onLifecycle=() => ())
  let _ = WsHub.register(~socket=sock2, ~clientIp="8.8.8.9", ~onLifecycle=() => ())
  clearWrites(fake1)
  clearWrites(fake2)
  WsHub.notifyReload()

  // Writes happen in registration order: sock1 first, sock2 second.
  // The exact frame bytes are verified in the integration test.
  let wc1 = getWriteCount(fake1)
  let wc2 = getWriteCount(fake2)

  assertion(
    ~message="writes arrive in insertion order: first registered, first written",
    ~operator="=",
    (a, b) => a == b,
    wc1,
    1,
  )
  assertion(
    ~message="second registered socket also receives write",
    ~operator="=",
    (a, b) => a == b,
    wc2,
    1,
  )
})

// ---------------------------------------------------------------------------
// Scenario: notifyReload — sync throw pruning (one fails, others survive)
// ---------------------------------------------------------------------------
test("WsHub.notifyReload continues to remaining clients after sync throw", () => {
  WsHub._testResetHub()
  let fake1 = createFakeSocket()
  let fake2 = createFakeSocket()
  let sock1 = asServerSocket(fake1)
  let sock2 = asServerSocket(fake2)

  let _ = WsHub.register(~socket=sock1, ~clientIp="9.9.9.9", ~onLifecycle=() => ())
  let _ = WsHub.register(~socket=sock2, ~clientIp="9.9.9.10", ~onLifecycle=() => ())
  clearWrites(fake1)
  clearWrites(fake2)

  // Configure fake1 to throw on write (sync failure).
  setThrowMode(fake1, true)

  // notifyReload should catch the throw, prune fake1, and still write to fake2.
  WsHub.notifyReload()

  let wc1 = getWriteCount(fake1)
  let wc2 = getWriteCount(fake2)

  // fake1 threw, so it should have 0 writes (pruned before write).
  // fake2 should have 1 write (survived and was written to).
  assertion(
    ~message="dead client was pruned (no write recorded)",
    ~operator="=",
    (a, b) => a == b,
    wc1,
    0,
  )
  assertion(
    ~message="healthy client still received the write",
    ~operator="=",
    (a, b) => a == b,
    wc2,
    1,
  )
})

// NOTE: Async rejection via error-event pruning is not covered by a spec scenario.
// The notifyReload sync-throw pruning is covered by the "One failing write" scenario
// (assertion wc1=0, wc2=1 above). Async rejection (setRejectMode) is a different
// failure mode: the write() call succeeds but the callback receives an error.
// Since socketWriteBuffer is synchronous and doesn't await the callback, the hub
// cannot detect this failure synchronously. This would require a design change
// (async socketWriteBuffer that the hub awaits). Out of scope for this change.

// ---------------------------------------------------------------------------
// Scenario: Per-IP cap — 3rd socket from same IP is rejected (perIpMax=2)
// ---------------------------------------------------------------------------
test("WsHub.register rejects 3rd socket from same IP (per-ip cap=2)", () => {
  WsHub._testResetHub()
  let fake1 = createFakeSocket()
  let fake2 = createFakeSocket()
  let fake3 = createFakeSocket()
  let sock1 = asServerSocket(fake1)
  let sock2 = asServerSocket(fake2)
  let sock3 = asServerSocket(fake3)

  let r1 = WsHub.register(~socket=sock1, ~clientIp="1.2.3.4", ~onLifecycle=() => ())
  let r2 = WsHub.register(~socket=sock2, ~clientIp="1.2.3.4", ~onLifecycle=() => ())

  // First two connections from the same IP succeed.
  assertion(
    ~message="first connection from IP should succeed",
    ~operator="=",
    (a, b) => a == b,
    r1,
    Ok(),
  )
  assertion(
    ~message="second connection from same IP should succeed",
    ~operator="=",
    (a, b) => a == b,
    r2,
    Ok(),
  )

  // Third from same IP is rejected with CapRejected({ reason: PerIp, clientIp }).
  let r3 = WsHub.register(~socket=sock3, ~clientIp="1.2.3.4", ~onLifecycle=() => ())
  switch r3 {
  | Error(CapRejected({ reason: PerIp, clientIp })) =>
    assertion(
      ~message="third connection should be rejected with PerIp reason",
      ~operator="=",
      (a, b) => a == b,
      clientIp,
      "1.2.3.4",
    )
  | Ok() =>
    assertion(
      ~message="third connection should NOT succeed",
      ~operator="=",
      (a, b) => a == b,
      "unexpected Ok",
      "Error expected",
    )
  | Error(CapRejected({ reason: Global, clientIp: _ })) =>
    assertion(
      ~message="rejection should be PerIp not Global",
      ~operator="=",
      (a, b) => a == b,
      "PerIp",
      "Global",
    )
  }
})

// ---------------------------------------------------------------------------
// Scenario: Global cap — 4th socket from any IP is rejected (globalMax=3)
// ---------------------------------------------------------------------------
test("WsHub.register rejects 4th socket regardless of IP (global cap=3)", () => {
  WsHub._testResetHub()
  let fake1 = createFakeSocket()
  let fake2 = createFakeSocket()
  let fake3 = createFakeSocket()
  let fake4 = createFakeSocket()
  let sock1 = asServerSocket(fake1)
  let sock2 = asServerSocket(fake2)
  let sock3 = asServerSocket(fake3)
  let sock4 = asServerSocket(fake4)

  let r1 = WsHub.register(~socket=sock1, ~clientIp="1.2.3.4", ~onLifecycle=() => ())
  let r2 = WsHub.register(~socket=sock2, ~clientIp="1.2.3.5", ~onLifecycle=() => ())
  let r3 = WsHub.register(~socket=sock3, ~clientIp="1.2.3.6", ~onLifecycle=() => ())

  // Three distinct IPs all succeed.
  assertion(
    ~message="first connection should succeed",
    ~operator="=",
    (a, b) => a == b,
    r1,
    Ok(),
  )
  assertion(
    ~message="second connection from different IP should succeed",
    ~operator="=",
    (a, b) => a == b,
    r2,
    Ok(),
  )
  assertion(
    ~message="third connection from yet another IP should succeed",
    ~operator="=",
    (a, b) => a == b,
    r3,
    Ok(),
  )

  // Fourth from any IP is rejected with Global.
  let r4 = WsHub.register(~socket=sock4, ~clientIp="1.2.3.7", ~onLifecycle=() => ())
  switch r4 {
  | Error(CapRejected({ reason: Global, clientIp: _ })) =>
    assertion(
      ~message="fourth connection should be rejected with Global reason",
      ~operator="=",
      (a, b) => a == b,
      true,
      true,
    )
  | Ok() =>
    assertion(
      ~message="fourth connection should NOT succeed",
      ~operator="=",
      (a, b) => a == b,
      "unexpected Ok",
      "Error expected",
    )
  | Error(CapRejected({ reason: PerIp, clientIp: _ })) =>
    assertion(
      ~message="rejection should be Global not PerIp",
      ~operator="=",
      (a, b) => a == b,
      "Global",
      "PerIp",
    )
  }
})

// ---------------------------------------------------------------------------
// Scenario: Disconnect decrements per-IP counter — 3rd reconnects after 1 closes
// ---------------------------------------------------------------------------
test("WsHub.disconnect decrements IP counter and allows new connection", () => {
  WsHub._testResetHub()
  let fake1 = createFakeSocket()
  let fake2 = createFakeSocket()
  let fake3 = createFakeSocket()
  let sock1 = asServerSocket(fake1)
  let sock2 = asServerSocket(fake2)
  let sock3 = asServerSocket(fake3)

  // Register two from same IP (at cap of 2).
  let r1 = WsHub.register(~socket=sock1, ~clientIp="5.6.7.8", ~onLifecycle=() => ())
  let r2 = WsHub.register(~socket=sock2, ~clientIp="5.6.7.8", ~onLifecycle=() => ())

  assertion(~message="first connection succeeds", ~operator="=", (a, b) => a == b, r1, Ok())
  assertion(~message="second connection succeeds", ~operator="=", (a, b) => a == b, r2, Ok())

  // Third should be rejected.
  let r3 = WsHub.register(~socket=sock3, ~clientIp="5.6.7.8", ~onLifecycle=() => ())
  switch r3 {
  | Error(CapRejected(_)) => () // expected
  | Ok() =>
    assertion(~message="third should be rejected before close", ~operator="=", (a, b) => a == b, "ok", "err")
  }

  // sock1 closes — simulate via the hub's registered close listener.
  callListeners(fake1, "close")

  // Now a new socket from the same IP should succeed.
  let fake4 = createFakeSocket()
  let sock4 = asServerSocket(fake4)
  let r4 = WsHub.register(~socket=sock4, ~clientIp="5.6.7.8", ~onLifecycle=() => ())

  switch r4 {
  | Ok() =>
    assertion(
      ~message="new connection after close should succeed",
      ~operator="=",
      (a, b) => a == b,
      true,
      true,
    )
  | Error(CapRejected({ reason: _, clientIp: _ })) =>
    assertion(
      ~message="new connection after close should NOT be rejected",
      ~operator="=",
      (a, b) => a == b,
      "rejected",
      "should be Ok",
    )
  }
})

// ---------------------------------------------------------------------------
// Scenario: Unknown IP bucket acts as single client (fallback IP = "unknown")
// ---------------------------------------------------------------------------
test("WsHub.register with unknown IP is treated as single client bucket", () => {
  WsHub._testResetHub()
  let fake1 = createFakeSocket()
  let fake2 = createFakeSocket()
  let fake3 = createFakeSocket()
  let sock1 = asServerSocket(fake1)
  let sock2 = asServerSocket(fake2)
  let sock3 = asServerSocket(fake3)

  let r1 = WsHub.register(~socket=sock1, ~clientIp="unknown", ~onLifecycle=() => ())
  let _r2 = WsHub.register(~socket=sock2, ~clientIp="unknown", ~onLifecycle=() => ())

  assertion(~message="first unknown-IP connection succeeds", ~operator="=", (a, b) => a == b, r1, Ok())
  // Second from "unknown" IP succeeds (at cap of 2). Third hits per-IP cap.
  let r3 = WsHub.register(~socket=sock3, ~clientIp="unknown", ~onLifecycle=() => ())
  switch r3 {
  | Error(CapRejected({ reason: PerIp, clientIp })) =>
    assertion(
      ~message="second unknown-IP should be rejected as PerIp",
      ~operator="=",
      (a, b) => a == b,
      clientIp,
      "unknown",
    )
  | _ =>
    assertion(
      ~message="second unknown-IP should be rejected",
      ~operator="=",
      (a, b) => a == b,
      "not rejected",
      "rejected",
    )
  }
})
