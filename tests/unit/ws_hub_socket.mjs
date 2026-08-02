// ws_hub_socket.mjs — typed fake socket that implements the minimal EventEmitter
// interface needed by the Events module. Records listener registrations for
// test verification and supports throw/reject modes for failure scenario testing.

let _counter = { count: 0 }

export function createFakeSocket() {
  const listeners = new Map()

  return {
    // EventEmitter interface
    on(eventName, callback) {
      if (!listeners.has(eventName)) {
        listeners.set(eventName, [])
      }
      listeners.get(eventName).push(callback)
      return this
    },
    removeListener(eventName, callback) {
      const arr = listeners.get(eventName) || []
      const idx = arr.indexOf(callback)
      if (idx !== -1) {
        arr.splice(idx, 1)
      }
      return this
    },
    // Test helper — call all listeners for an event
    _callListeners(eventName) {
      const arr = listeners.get(eventName) || []
      for (const cb of arr) {
        cb()
      }
    },
  }
}

// Standalone function to call listeners on a fake socket.
// Useful from ReScript where we can't call methods on type variables.
export function callListeners(fakeSocket, eventName) {
  fakeSocket._callListeners(eventName)
}

export function getCounter() {
  return _counter
}
