// Hub/WsHub — WebSocket client hub.
// Tracks upgraded serverSocket values and broadcasts "reload" frames.
// Out of scope: Phase-6 watcher call site, Phase-7 wiring.

open WsHub_Types

// ---------------------------------------------------------------------------
// Private state
// ---------------------------------------------------------------------------

// Private client record — owns socket, client IP, and its lifecycle callbacks.
// Callbacks are stored so they can be detached on unregister.
type client = {
  socket: Http.serverSocket,
  clientIp: string,
  onClose: unit => unit,
  onError: unit => unit,
}

// Private state: insertion-ordered array of registered clients.
// The array preserves registration order for deterministic broadcast.
// The state is not exported in WsHub.resi — encapsulated.
let clients: ref<array<client>> = ref([])

// Per-IP connection counts. Key = IP string, value = current count for that IP.
// Empty entries MUST be removed on decrement to prevent unbounded map growth.
let perIpCounts: ref<Belt.Map.String.t<int>> = ref(Belt.Map.String.empty)

// Global connection counter
let globalCount: ref<int> = ref(0)

// Configurable caps — initialised from Config.t at startup via init().
let maxPerIp: ref<int> = ref(2)
let maxGlobal: ref<int> = ref(3)

let init = (~maxPerIp as m, ~maxGlobal as g): unit => {
  maxPerIp := m
  maxGlobal := g
}

// ---------------------------------------------------------------------------
// Private helpers
// ---------------------------------------------------------------------------

// Linear scan for identity check. N is small (live-reload clients); O(N) is fine.
let clientExists = (socket: Http.serverSocket): bool => {
  let i = ref(0)
  let found = ref(false)
  while i.contents < Array.length(clients.contents) {
    let c = clients.contents[i.contents]
    switch c {
    | Some(client) =>
      if client.socket === socket {
        found := true
        i := Array.length(clients.contents) // break
      } else {
        i := i.contents + 1
      }
    | None => i := i.contents + 1
    }
  }
  found.contents
}

// Remove a client from the ordered array by socket reference equality.
// Returns the removed client, or None if not found.
let removeFromClients = (socket: Http.serverSocket): option<client> => {
  let cs = clients.contents
  let len = Array.length(cs)
  let i = ref(0)
  let found: ref<option<client>> = ref(None)
  while i.contents < len {
    let c = cs[i.contents]
    switch c {
    | Some(client) =>
      if client.socket === socket {
        found := Some(client)
        // Splice: head + tail (preserves insertion order of survivors).
        let head = Array.slice(cs, ~start=0, ~end=i.contents)
        let tail = Array.slice(cs, ~start=i.contents + 1, ~end=len - i.contents)
        clients := Array.concat(head, tail)
        i := len // break
      } else {
        i := i.contents + 1
      }
    | None => i := i.contents + 1
    }
  }
  found.contents
}

// Construct the unmasked WebSocket text frame for "reload".
// Frame format: 0x81 | length (7-bit) | UTF-8 payload
// "reload" = 6 bytes → length byte = 0x06.
// Resulting bytes: 81 06 72 65 6c 6f 61 64
let makeReloadFrame = (): Buffer.t => {
  let payload = Buffer.fromString("reload", "utf8")
  let header = Buffer.fromArray([129, 6])
  Buffer.concat([header, payload])
}

// ---------------------------------------------------------------------------
// Public API (matches WsHub.resi)
// ---------------------------------------------------------------------------

// Register a new socket with cap enforcement. Idempotent for the same socket.
// Attaches 'close' and 'error' listeners that auto-unregister the socket.
// Returns Ok() on success, Error(capRejected) if per-IP or global cap is hit.
let rec register = (
  ~socket: Http.serverSocket,
  ~clientIp: string,
  ~onLifecycle: unit => unit,
): result<unit, capRejected> => {
  if clientExists(socket) {
    Ok()
  } else {
    // Cap checks BEFORE adding the client
    let ipCount = switch Belt.Map.String.get(perIpCounts.contents, clientIp) {
    | Some(n) => n
    | None => 0
    }
    if ipCount >= maxPerIp.contents {
      Error(CapRejected({ reason: PerIp, clientIp }))
    } else if globalCount.contents >= maxGlobal.contents {
      Error(CapRejected({ reason: Global, clientIp }))
    } else {
      // Increment counters BEFORE registering
      perIpCounts := Belt.Map.String.set(perIpCounts.contents, clientIp, ipCount + 1)
      globalCount := globalCount.contents + 1
      // Lifecycle callback — production passes no-op () => (), tests pass incrementHubListenerCounter
      let invoke = onLifecycle
      // Attach lifecycle callbacks and register
      let onClose = () => {
        invoke()
        unregister(socket, clientIp)
      }
      let onError = () => {
        invoke()
        unregister(socket, clientIp)
      }
      let _ = Events.on(socket, "close", onClose)
      let _ = Events.on(socket, "error", onError)
      let entry = { socket, clientIp, onClose, onError }
      clients := Array.concat(clients.contents, [entry])
      Ok()
    }
  }
}

// Unregister a socket. Idempotent — no-op if unknown.
// Detaches the lifecycle listeners and removes the client record.
// Decrements both global and per-IP counters; evicts the per-IP entry when count reaches 0.
and unregister = (socket: Http.serverSocket, clientIp: string): unit => {
  let maybe = removeFromClients(socket)
  switch maybe {
  | Some(entry) => {
      let _ = Events.remove(socket, "close", entry.onClose)
      let _ = Events.remove(socket, "error", entry.onError)
      // Decrement global counter
      globalCount := globalCount.contents - 1
      // Decrement per-IP counter; remove entry if count reaches 0
      switch Belt.Map.String.get(perIpCounts.contents, clientIp) {
      | Some(n) =>
        if n <= 1 {
          perIpCounts := Belt.Map.String.remove(perIpCounts.contents, clientIp)  // evict empty entry
        } else {
          perIpCounts := Belt.Map.String.set(perIpCounts.contents, clientIp, n - 1)
        }
      | None => ()
      }
    }
  | None => ()
  }
}

// test-only: expose registered client count for unit-test assertions.
let _testGetRegisteredCount = (): int => Array.length(clients.contents)

// test-only: reset hub state — clears all registered clients and counters.
// Used by unit tests to ensure a clean baseline before each test.
let _testResetHub = (): unit => {
  clients := []
  perIpCounts := Belt.Map.String.empty
  globalCount := 0
  ()
}

// Close all registered WebSocket sockets explicitly.
// Called during Httpath.shutdown to ensure graceful WebSocket close
// before the process exits. Each socket will emit its 'close' event,
// which triggers unregister via the already-attached onClose listener.
let closeAll = (): unit => {
  let snapshot = clients.contents
  if Array.length(snapshot) == 0 {
    ()
  } else {
    let i = ref(0)
    while i.contents < Array.length(snapshot) {
      let entryOpt = snapshot[i.contents]
      switch entryOpt {
      | Some(client) => {
          Http.socketDestroy(client.socket)
          ()
        }
      | None => ()
      }
      i := i.contents + 1
    }
    ()
  }
}

// Broadcast "reload" frame to all registered clients.
// Snapshot the array to avoid iterator invalidation on prune.
// Continues to remaining clients if a write fails.
and notifyReload = (): unit => {
  let snapshot = clients.contents
  if Array.length(snapshot) == 0 {
    ()
  } else {
    let frame = makeReloadFrame()
    let i = ref(0)
    while i.contents < Array.length(snapshot) {
      let entryOpt = snapshot[i.contents]
      switch entryOpt {
      | Some(client) => {
          // Listen for async error before attempting write.
          let errorListener = () => unregister(client.socket, client.clientIp)
          let _ = Events.on(client.socket, "error", errorListener)
          try {
            // Attempt one non-blocking write. The error listener handles async
            // failure (socket closed after write() returned but before flush).
            let _ = Http.socketWriteBuffer(client.socket, frame)
          } catch {
          | _ => {
              // Sync throw — socket not writable. Prune immediately.
              let _ = Events.remove(client.socket, "error", errorListener)
              unregister(client.socket, client.clientIp)
            }
          }
          i := i.contents + 1
        }
      | None => i := i.contents + 1
      }
    }
    ()
  }
}
