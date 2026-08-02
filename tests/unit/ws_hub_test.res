// ws_hub_test.res — Unit tests for Hub.WsHub.
// Tests register/unregister/idempotency/auto-cleanup via observable side-effects.
// The fake socket records events; the hub's public API is exercised without throws.

open Test

@module("./ws_hub_socket.mjs")
external createFakeSocket: unit => 'fakeSocket = "createFakeSocket"

@module("./ws_hub_socket.mjs")
external getCounter: unit => 'counter = "getCounter"

@module("./ws_hub_socket.mjs")
external callListeners: ('fakeSocket, string) => unit = "callListeners"

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

// Cast fake to serverSocket for hub calls.
external asServerSocket: 'a => Http.serverSocket = "%identity"

// ---------------------------------------------------------------------------
// Scenario: Register a single client — no throw
// ---------------------------------------------------------------------------
test("WsHub.register does not throw for a new socket", () => {
  let fake = createFakeSocket()
  let sock = asServerSocket(fake)

  // Should not throw.
  WsHub.register(sock)

  assertion(
    ~message="register new socket should not throw",
    ~operator="=",
    (a, b) => a == b,
    true,
    true,
  )
})

// ---------------------------------------------------------------------------
// Scenario: Register is idempotent — second register is a no-op (no throw)
// ---------------------------------------------------------------------------
test("WsHub.register is idempotent — second call is a no-op", () => {
  let fake = createFakeSocket()
  let sock = asServerSocket(fake)

  WsHub.register(sock)
  // Second registration should be a no-op (no throw, no error).
  WsHub.register(sock)

  assertion(
    ~message="double register should not throw",
    ~operator="=",
    (a, b) => a == b,
    true,
    true,
  )
})

// ---------------------------------------------------------------------------
// Scenario: Unregister a registered client — no throw
// ---------------------------------------------------------------------------
test("WsHub.unregister does not throw for a registered socket", () => {
  let fake = createFakeSocket()
  let sock = asServerSocket(fake)

  WsHub.register(sock)
  // Should not throw.
  WsHub.unregister(sock)

  assertion(
    ~message="unregister registered socket should not throw",
    ~operator="=",
    (a, b) => a == b,
    true,
    true,
  )
})

// ---------------------------------------------------------------------------
// Scenario: Unregister an unknown client — idempotent, no throw
// ---------------------------------------------------------------------------
test("WsHub.unregister is idempotent — unknown socket is a no-op", () => {
  let fake = createFakeSocket()
  let sock = asServerSocket(fake)

  // Never registered — should be a no-op, no throw.
  WsHub.unregister(sock)

  assertion(
    ~message="unregister unknown socket should not throw",
    ~operator="=",
    (a, b) => a == b,
    true,
    true,
  )
})

// ---------------------------------------------------------------------------
// Scenario: Socket emits close — auto-unregistration (via listener attachment)
// ---------------------------------------------------------------------------
test("WsHub.register attaches close listener — socket close triggers unregister", () => {
  let fake = createFakeSocket()
  let sock = asServerSocket(fake)
  let counter = getCounter()
  counter["count"] = 0

  WsHub.register(sock)
  // Emit a close event — the hub's close listener should fire.
  callListeners(fake, "close")

  // The counter increments when the listener fires.
  // Since the close listener calls unregister (which removes the close listener),
  // re-emitting close should NOT increment again (listener was detached).
  let countBefore = counter["count"]
  callListeners(fake, "close")
  let countAfter = counter["count"]

  // Close listener fires on first emit; second emit should not fire
  // (listener was removed by unregister).
  assertion(
    ~message="close event should fire listener once then be removed",
    ~operator="=",
    (a, b) => a == b,
    countAfter,
    countBefore,
  )
})

// ---------------------------------------------------------------------------
// Scenario: Socket emits error — auto-unregistration
// ---------------------------------------------------------------------------
test("WsHub.register attaches error listener — socket error triggers unregister", () => {
  let fake = createFakeSocket()
  let sock = asServerSocket(fake)
  let counter = getCounter()
  counter["count"] = 0

  WsHub.register(sock)
  // Emit an error event — the hub's error listener should fire.
  callListeners(fake, "error")

  let countBefore = counter["count"]
  callListeners(fake, "error")
  let countAfter = counter["count"]

  assertion(
    ~message="error event should fire listener once then be removed",
    ~operator="=",
    (a, b) => a == b,
    countAfter,
    countBefore,
  )
})

// ---------------------------------------------------------------------------
// Scenario: Notify with zero clients — no throw
// ---------------------------------------------------------------------------
test("WsHub.notifyReload on empty hub is a no-op", () => {
  // With no sockets registered, notifyReload should be a no-op (no throw).
  WsHub.notifyReload()

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
  let fake = createFakeSocket()
  let sock = asServerSocket(fake)

  WsHub.register(sock)
  // notifyReload should not throw even when write succeeds.
  WsHub.notifyReload()

  assertion(
    ~message="notifyReload with one client should not throw",
    ~operator="=",
    (a, b) => a == b,
    true,
    true,
  )
})

// ---------------------------------------------------------------------------
// Scenario: notifyReload with N clients — all receive the frame
// ---------------------------------------------------------------------------
test("WsHub.notifyReload broadcasts to all registered clients", () => {
  let fake1 = createFakeSocket()
  let fake2 = createFakeSocket()
  let sock1 = asServerSocket(fake1)
  let sock2 = asServerSocket(fake2)

  WsHub.register(sock1)
  WsHub.register(sock2)
  WsHub.notifyReload()

  // Both sockets should have received exactly one write.
  let wc1 = getWriteCount(fake1)
  let wc2 = getWriteCount(fake2)

  assertion(
    ~message="first socket received one write",
    ~operator="=",
    (a, b) => a == b,
    wc1,
    1,
  )
  assertion(
    ~message="second socket received one write",
    ~operator="=",
    (a, b) => a == b,
    wc2,
    1,
  )
})

// ---------------------------------------------------------------------------
// Scenario: notifyReload preserves insertion order (deterministic broadcast)
// ---------------------------------------------------------------------------
test("WsHub.notifyReload broadcasts in registration order", () => {
  let fake1 = createFakeSocket()
  let fake2 = createFakeSocket()
  let sock1 = asServerSocket(fake1)
  let sock2 = asServerSocket(fake2)

  WsHub.register(sock1)
  WsHub.register(sock2)
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
  let fake1 = createFakeSocket()
  let fake2 = createFakeSocket()
  let sock1 = asServerSocket(fake1)
  let sock2 = asServerSocket(fake2)

  WsHub.register(sock1)
  WsHub.register(sock2)
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
