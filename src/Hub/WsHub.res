// Hub/WsHub — WebSocket client hub.
// Tracks upgraded serverSocket values and broadcasts "reload" frames.
// Out of scope: Phase-6 watcher call site, Phase-7 wiring.

// ---------------------------------------------------------------------------
// Private state
// ---------------------------------------------------------------------------

// Private client record — owns socket and its lifecycle callbacks.
// Callbacks are stored so they can be detached on unregister.
type client = {
  socket: Http.serverSocket,
  onClose: unit => unit,
  onError: unit => unit,
}

// Private state: insertion-ordered array of registered clients.
// The array preserves registration order for deterministic broadcast.
// The state is not exported in WsHub.resi — encapsulated.
let clients: ref<array<client>> = ref([])

// ---------------------------------------------------------------------------
// Private helpers
// ---------------------------------------------------------------------------

// Linear scan for identity check. N is small (live-reload clients); O(N) is fine.
let clientExists = (socket: Http.serverSocket): bool => {
  let i = ref(0)
  let found = ref(false)
  while i.contents < Array.length(clients.contents) {
    let c = Array.get(clients.contents, i.contents)
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
    let c = Array.get(cs, i.contents)
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

// Register a new socket. Idempotent — no-op if already registered.
// Attaches 'close' and 'error' listeners that auto-unregister the socket.
let rec register = (socket: Http.serverSocket): unit => {
  if clientExists(socket) {
    ()
  } else {
    let onClose = () => unregister(socket)
    let onError = () => unregister(socket)
    let _ = Events.on(socket, "close", onClose)
    let _ = Events.on(socket, "error", onError)
    let entry = {socket, onClose, onError}
    clients := Array.concat(clients.contents, [entry])
    ()
  }
}

// Unregister a socket. Idempotent — no-op if unknown.
// Detaches the lifecycle listeners and removes the client record.
and unregister = (socket: Http.serverSocket): unit => {
  let maybe = removeFromClients(socket)
  switch maybe {
  | Some(entry) => {
      let _ = Events.remove(socket, "close", entry.onClose)
      let _ = Events.remove(socket, "error", entry.onError)
      ()
    }
  | None => ()
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
      let entryOpt = Array.get(snapshot, i.contents)
      switch entryOpt {
      | Some(client) => {
          // Listen for async error before attempting write.
          let errorListener = () => unregister(client.socket)
          let _ = Events.on(client.socket, "error", errorListener)
          try {
            // Attempt one non-blocking write. The error listener handles async
            // failure (socket closed after write() returned but before flush).
            let _ = Http.socketWriteBuffer(client.socket, frame)
            ()
          } catch {
          | _ => {
              // Sync throw — socket not writable. Prune immediately.
              let _ = Events.remove(client.socket, "error", errorListener)
              unregister(client.socket)
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
