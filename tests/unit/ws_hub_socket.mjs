// ws_hub_socket.mjs — typed fake socket that implements the minimal EventEmitter
// interface needed by the Events module. Records listener registrations for
// test verification and supports throw/reject modes for failure scenario testing.
// Extended for WsHub tests: write recording, throw/reject modes.

const _counter = { count: 0 };

export function createFakeSocket() {
  const listeners = new Map();
  let writeCount = 0;
  let lastWrite = null;
  let throwMode = false;
  let rejectMode = false;

  const socket = {
    // EventEmitter interface
    on(eventName, callback) {
      if (!listeners.has(eventName)) {
        listeners.set(eventName, []);
      }
      listeners.get(eventName).push(callback);
      return socket;
    },
    removeListener(eventName, callback) {
      const arr = listeners.get(eventName) || [];
      const idx = arr.indexOf(callback);
      if (idx !== -1) {
        arr.splice(idx, 1);
      }
      return socket;
    },
    // Test helper — call all listeners for an event
    _callListeners(eventName) {
      const arr = listeners.get(eventName) || [];
      for (const cb of arr) {
        cb();
      }
    },
    // Buffer write — records call and optionally throws/rejects
    write(buf, cb) {
      // Check throw mode BEFORE recording the write attempt.
      if (throwMode) {
        throw new Error("synthetic sync throw");
      }
      writeCount++;
      lastWrite = buf ? Array.from(buf) : [];
      if (rejectMode && cb) {
        // Simulate async rejection by calling cb with an error.
        process.nextTick(() => cb(new Error("synthetic reject")));
        return false;
      }
      if (cb) {
        process.nextTick(() => cb(null));
      }
      return true;
    },
    // Test instrumentation
    _getWriteCount() {
      return writeCount;
    },
    _getLastWrite() {
      return lastWrite || [];
    },
    _clearWrites() {
      writeCount = 0;
      lastWrite = null;
    },
    _setThrowMode(val) {
      throwMode = val;
    },
    _setRejectMode(val) {
      rejectMode = val;
    },
  };

  return socket;
}

// Standalone function to call listeners on a fake socket.
// Useful from ReScript where we can't call methods on type variables.
export function callListeners(fakeSocket, eventName) {
  fakeSocket._callListeners(eventName);
}

export function getCounter() {
  return _counter;
}

// Extended helpers for ws_hub_test.res
export function setThrowMode(fakeSocket, val) {
  fakeSocket._setThrowMode(val);
}

export function setRejectMode(fakeSocket, val) {
  fakeSocket._setRejectMode(val);
}

export function getWriteCount(fakeSocket) {
  return fakeSocket._getWriteCount();
}

export function getLastWrite(fakeSocket) {
  return fakeSocket._getLastWrite();
}

export function clearWrites(fakeSocket) {
  fakeSocket._clearWrites();
}
