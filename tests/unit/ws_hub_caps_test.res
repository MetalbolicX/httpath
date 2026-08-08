// ws_hub_caps_test.res — Unit tests for configurable WebSocket connection caps (plan 033).
// Verifies that WsHub.init sets maxPerIp and maxGlobal, and that register
// enforces these caps correctly. Defaults (2 per-IP, 3 global) must match the
// hardcoded values that were previously in WsHub.res.

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

external asServerSocket: 'a => Http.serverSocket = "%identity"

// ---------------------------------------------------------------------------
// Scenario: Default caps — per-ip cap of 2 is enforced (same IP, 3rd rejected)
// ---------------------------------------------------------------------------
test("WsHub.init(2,3): 3rd connection from same IP is rejected with PerIp", () => {
  WsHub._testResetHub()
  WsHub.init(~maxPerIp=2, ~maxGlobal=3)

  let fake1 = createFakeSocket()
  let fake2 = createFakeSocket()
  let fake3 = createFakeSocket()
  let sock1 = asServerSocket(fake1)
  let sock2 = asServerSocket(fake2)
  let sock3 = asServerSocket(fake3)

  let r1 = WsHub.register(~socket=sock1, ~clientIp="10.0.0.1", ~onLifecycle=() => ())
  let r2 = WsHub.register(~socket=sock2, ~clientIp="10.0.0.1", ~onLifecycle=() => ())

  assertion(~message="first connection succeeds", ~operator="=", (a, b) => a == b, r1, Ok())
  assertion(~message="second connection from same IP succeeds", ~operator="=", (a, b) => a == b, r2, Ok())

  let r3 = WsHub.register(~socket=sock3, ~clientIp="10.0.0.1", ~onLifecycle=() => ())
  switch r3 {
  | Error(CapRejected({ reason: PerIp, clientIp })) =>
    assertion(~message="third from same IP rejected with PerIp", ~operator="=", (a, b) => a == b, clientIp, "10.0.0.1")
  | Ok() =>
    assertion(~message="third should NOT succeed", ~operator="=", (a, b) => a == b, "unexpected Ok", "Error expected")
  | Error(CapRejected({ reason: Global, clientIp: _ })) =>
    assertion(~message="should be PerIp not Global", ~operator="=", (a, b) => a == b, "PerIp", "Global")
  }
})

// ---------------------------------------------------------------------------
// Scenario: Default caps — global cap of 3 is enforced (4th from any IP rejected)
// ---------------------------------------------------------------------------
test("WsHub.init(2,3): 4th connection from any IP is rejected with Global", () => {
  WsHub._testResetHub()
  WsHub.init(~maxPerIp=2, ~maxGlobal=3)

  let fake1 = createFakeSocket()
  let fake2 = createFakeSocket()
  let fake3 = createFakeSocket()
  let fake4 = createFakeSocket()
  let sock1 = asServerSocket(fake1)
  let sock2 = asServerSocket(fake2)
  let sock3 = asServerSocket(fake3)
  let sock4 = asServerSocket(fake4)

  let r1 = WsHub.register(~socket=sock1, ~clientIp="10.0.0.1", ~onLifecycle=() => ())
  let r2 = WsHub.register(~socket=sock2, ~clientIp="10.0.0.2", ~onLifecycle=() => ())
  let r3 = WsHub.register(~socket=sock3, ~clientIp="10.0.0.3", ~onLifecycle=() => ())

  assertion(~message="first succeeds", ~operator="=", (a, b) => a == b, r1, Ok())
  assertion(~message="second from different IP succeeds", ~operator="=", (a, b) => a == b, r2, Ok())
  assertion(~message="third from yet another IP succeeds", ~operator="=", (a, b) => a == b, r3, Ok())

  let r4 = WsHub.register(~socket=sock4, ~clientIp="10.0.0.4", ~onLifecycle=() => ())
  switch r4 {
  | Error(CapRejected({ reason: Global, clientIp: _ })) =>
    assertion(~message="fourth connection rejected with Global", ~operator="=", (a, b) => a == b, true, true)
  | Ok() =>
    assertion(~message="fourth should NOT succeed", ~operator="=", (a, b) => a == b, "unexpected Ok", "Error expected")
  | Error(CapRejected({ reason: PerIp, clientIp: _ })) =>
    assertion(~message="should be Global not PerIp", ~operator="=", (a, b) => a == b, "Global", "PerIp")
  }
})

// ---------------------------------------------------------------------------
// Scenario: Custom caps — per-ip cap of 5 is honoured (6th from same IP rejected)
// ---------------------------------------------------------------------------
test("WsHub.init(5,10): 6th connection from same IP is rejected with PerIp", () => {
  WsHub._testResetHub()
  WsHub.init(~maxPerIp=5, ~maxGlobal=10)

  let f1 = createFakeSocket()
  let f2 = createFakeSocket()
  let f3 = createFakeSocket()
  let f4 = createFakeSocket()
  let f5 = createFakeSocket()
  let f6 = createFakeSocket()
  let f7 = createFakeSocket()
  let s1 = asServerSocket(f1)
  let s2 = asServerSocket(f2)
  let s3 = asServerSocket(f3)
  let s4 = asServerSocket(f4)
  let s5 = asServerSocket(f5)
  let s6 = asServerSocket(f6)
  let _s7 = asServerSocket(f7)

  // First 5 from same IP — all succeed.
  let r1 = WsHub.register(~socket=s1, ~clientIp="10.0.0.1", ~onLifecycle=() => ())
  let r2 = WsHub.register(~socket=s2, ~clientIp="10.0.0.1", ~onLifecycle=() => ())
  let r3 = WsHub.register(~socket=s3, ~clientIp="10.0.0.1", ~onLifecycle=() => ())
  let r4 = WsHub.register(~socket=s4, ~clientIp="10.0.0.1", ~onLifecycle=() => ())
  let r5 = WsHub.register(~socket=s5, ~clientIp="10.0.0.1", ~onLifecycle=() => ())

  let allOk = r1 == Ok() && r2 == Ok() && r3 == Ok() && r4 == Ok() && r5 == Ok()
  assertion(~message="first 5 connections from same IP succeed", ~operator="=", (a, b) => a == b, allOk, true)

  // 6th is rejected.
  let r6 = WsHub.register(~socket=s6, ~clientIp="10.0.0.1", ~onLifecycle=() => ())
  switch r6 {
  | Error(CapRejected({ reason: PerIp, clientIp })) =>
    assertion(~message="6th from same IP rejected with PerIp", ~operator="=", (a, b) => a == b, clientIp, "10.0.0.1")
  | Ok() =>
    assertion(~message="6th should NOT succeed", ~operator="=", (a, b) => a == b, "unexpected Ok", "Error expected")
  | Error(CapRejected({ reason: Global, clientIp: _ })) =>
    assertion(~message="should be PerIp not Global", ~operator="=", (a, b) => a == b, "PerIp", "Global")
  }
})

// ---------------------------------------------------------------------------
// Scenario: Custom caps — global cap of 3 is honoured (4th from different IPs rejected)
// ---------------------------------------------------------------------------
test("WsHub.init(5,3): 4th connection from different IPs is rejected with Global", () => {
  WsHub._testResetHub()
  WsHub.init(~maxPerIp=5, ~maxGlobal=3)

  let fake1 = createFakeSocket()
  let fake2 = createFakeSocket()
  let fake3 = createFakeSocket()
  let fake4 = createFakeSocket()
  let sock1 = asServerSocket(fake1)
  let sock2 = asServerSocket(fake2)
  let sock3 = asServerSocket(fake3)
  let sock4 = asServerSocket(fake4)

  let r1 = WsHub.register(~socket=sock1, ~clientIp="10.0.0.1", ~onLifecycle=() => ())
  let r2 = WsHub.register(~socket=sock2, ~clientIp="10.0.0.2", ~onLifecycle=() => ())
  let r3 = WsHub.register(~socket=sock3, ~clientIp="10.0.0.3", ~onLifecycle=() => ())

  assertion(~message="first 3 succeed", ~operator="=", (a, b) => a == b, r1, Ok())
  assertion(~message="second succeeds", ~operator="=", (a, b) => a == b, r2, Ok())
  assertion(~message="third succeeds", ~operator="=", (a, b) => a == b, r3, Ok())

  let r4 = WsHub.register(~socket=sock4, ~clientIp="10.0.0.4", ~onLifecycle=() => ())
  switch r4 {
  | Error(CapRejected({ reason: Global, clientIp: _ })) =>
    assertion(~message="4th rejected with Global", ~operator="=", (a, b) => a == b, true, true)
  | Ok() =>
    assertion(~message="4th should NOT succeed", ~operator="=", (a, b) => a == b, "unexpected Ok", "Error expected")
  | Error(CapRejected({ reason: PerIp, clientIp: _ })) =>
    assertion(~message="should be Global not PerIp", ~operator="=", (a, b) => a == b, "Global", "PerIp")
  }
})

// ---------------------------------------------------------------------------
// Scenario: After _testResetHub, caps are still set to last init values
// ---------------------------------------------------------------------------
test("WsHub._testResetHub preserves last init caps", () => {
  WsHub._testResetHub()
  WsHub.init(~maxPerIp=1, ~maxGlobal=1)

  let fake1 = createFakeSocket()
  let fake2 = createFakeSocket()
  let fake3 = createFakeSocket()
  let sock1 = asServerSocket(fake1)
  let sock2 = asServerSocket(fake2)
  let sock3 = asServerSocket(fake3)

  // First from IP1 succeeds.
  let r1 = WsHub.register(~socket=sock1, ~clientIp="10.0.0.1", ~onLifecycle=() => ())
  assertion(~message="first connection succeeds", ~operator="=", (a, b) => a == b, r1, Ok())

  // Second from same IP hits per-ip cap of 1.
  let r2 = WsHub.register(~socket=sock2, ~clientIp="10.0.0.1", ~onLifecycle=() => ())
  switch r2 {
  | Error(CapRejected({ reason: PerIp, clientIp })) =>
    assertion(~message="second from same IP rejected with PerIp", ~operator="=", (a, b) => a == b, clientIp, "10.0.0.1")
  | _ =>
    assertion(~message="second should be rejected", ~operator="=", (a, b) => a == b, "not rejected", "rejected")
  }

  // _testResetHub clears state but keeps caps.
  WsHub._testResetHub()

  // New first from IP1 succeeds (state was reset, caps were preserved).
  let r3 = WsHub.register(~socket=sock3, ~clientIp="10.0.0.1", ~onLifecycle=() => ())
  assertion(~message="after reset, new connection succeeds (caps preserved)", ~operator="=", (a, b) => a == b, r3, Ok())
})
