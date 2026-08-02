// monitor_socket.mjs — typed fake for Monitor unit tests.
// Provides controllable timer advancement so tests can exercise the debounce
// window deterministically without real wall-clock delays.
//
// Usage:
//   import { makeFakeClock, advanceTime } from "./monitor_socket.mjs"
//   // In test: after calling Monitor.start(...), advanceTime(600)
//   // to fire all pending 500ms debounce timers.

let pendingCallbacks = [];
let currentTime = 0;

// Capture setTimeout calls.
const originalSetTimeout = globalThis.setTimeout;
const originalClearTimeout = globalThis.clearTimeout;

export function makeFakeClock() {
  pendingCallbacks = [];
  currentTime = 0;

  // Replace globals with fake versions.
  globalThis.setTimeout = (fn, delay) => {
    const id = pendingCallbacks.length;
    pendingCallbacks.push({
      fn,
      delay: delay ?? 0,
      fireAt: currentTime + delay,
    });
    return id;
  };

  globalThis.clearTimeout = (id) => {
    if (id !== undefined && id !== null && pendingCallbacks[id] !== undefined) {
      pendingCallbacks[id] = null; // mark as cleared
    }
  };
}

export function restoreClock() {
  globalThis.setTimeout = originalSetTimeout;
  globalThis.clearTimeout = originalClearTimeout;
  pendingCallbacks = [];
  currentTime = 0;
}

// Advance fake time by `ms` milliseconds and fire all timers whose
// fireAt <= new currentTime.
export function advanceTime(ms) {
  const target = currentTime + ms;
  // Fire in order of fireAt.
  // Sort pending by fireAt.
  const toFire = [];
  for (let i = 0; i < pendingCallbacks.length; i++) {
    const t = pendingCallbacks[i];
    if (t !== null && t !== undefined && t.fireAt <= target) {
      toFire.push(t);
      pendingCallbacks[i] = null; // mark as fired
    }
  }
  // Sort by fireAt to fire in order.
  toFire.sort((a, b) => a.fireAt - b.fireAt);
  for (const t of toFire) {
    currentTime = t.fireAt;
    try {
      t.fn();
    } catch (e) {
      // Re-throw in test context.
      throw e;
    }
  }
  currentTime = target;
}

// Get count of pending (not yet fired, not cleared) timers.
export function getPendingTimerCount() {
  let count = 0;
  for (const t of pendingCallbacks) {
    if (t !== null && t !== undefined) count++;
  }
  return count;
}

// Get pending timer delays.
export function getPendingDelays() {
  const delays = [];
  for (const t of pendingCallbacks) {
    if (t !== null && t !== undefined) delays.push(t.delay);
  }
  return delays;
}

// Export last exit code for Process.exit stub compatibility.
let lastExitCode = null;
export function getLastExitCode() {
  return lastExitCode;
}
export function resetExitCode() {
  lastExitCode = null;
}
