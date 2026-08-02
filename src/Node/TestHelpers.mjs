// TestHelpers.mjs — shared test instrumentation for hub unit tests.
// This module is imported by both WsHub.res (via ReScript interop) and
// ws_hub_socket.mjs. It lives in src/Node/ so the hub can reach it without
// depending on test files.
//
// DO NOT import this from production code outside of test-only builds.

// Module-level counter for verifying that lifecycle listeners actually fire.
// Incremented by WsHub's onClose/onError callbacks.
const _hubListenerCounter = { count: 0 }

export function getHubListenerCounter() {
  return _hubListenerCounter
}

export function resetHubListenerCounter() {
  _hubListenerCounter.count = 0
}

export function incrementHubListenerCounter() {
  _hubListenerCounter.count++
}
