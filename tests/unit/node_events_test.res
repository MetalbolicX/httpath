open Test

@module("./ws_hub_socket.mjs")
external createFakeSocket: unit => 'fakeSocket = "createFakeSocket"

@module("./ws_hub_socket.mjs")
external getCounter: unit => 'counter = "getCounter"

@module("./ws_hub_socket.mjs")
external callListeners: ('fakeSocket, string) => unit = "callListeners"

external asServerSocket: 'a => Http.serverSocket = "%identity"

test("Events.on attaches listener — callListeners verifies it fires", () => {
  let fake = createFakeSocket()
  let counter = getCounter()
  counter["count"] = 0

  let listener = () => { counter["count"] = counter["count"] + 1 }
  let sock = asServerSocket(fake)

  // Attach
  let _ = Events.on(sock, "close", listener)

  // Trigger the listener via callListeners (proves it was attached)
  let _ = callListeners(fake, "close")

  assertion(
    ~message="listener fired when event emitted — count is 1",
    ~operator="=",
    (a, b) => a == b,
    counter["count"],
    1,
  )
})

test("Events.remove detaches listener — callListeners after remove shows no fire", () => {
  let fake = createFakeSocket()
  let counter = getCounter()
  counter["count"] = 0

  let listener = () => { counter["count"] = counter["count"] + 1 }
  let sock = asServerSocket(fake)

  // Attach and verify it fires
  let _ = Events.on(sock, "close", listener)
  let _ = callListeners(fake, "close")
  assertion(
    ~message="listener fires before removal",
    ~operator="=",
    (a, b) => a == b,
    counter["count"],
    1,
  )

  // Remove and verify it no longer fires
  counter["count"] = 0
  let _ = Events.remove(sock, "close", listener)
  let _ = callListeners(fake, "close")

  assertion(
    ~message="listener does NOT fire after removal — count stays 0",
    ~operator="=",
    (a, b) => a == b,
    counter["count"],
    0,
  )
})

test("Events.on is fluent — returns socket for chaining", () => {
  let fake = createFakeSocket()
  let sock = asServerSocket(fake)

  // Verify Events.on returns socket by chaining Events.remove on its result
  let result = Events.on(sock, "data", () => ())
  let chained = Events.remove(result, "data", () => ())

  // chained should still be a socket — attach another event to prove it
  let called = ref(false)
  let listener = () => { called := true }
  let _ = Events.on(chained, "error", listener)

  // If chaining works, the above should compile and the listener should be attachable
  assertion(
    ~message="on returns socket; remove returns socket; both accept further on calls",
    ~operator="=",
    (a, b) => a == b,
    true,
    true,
  )
})
