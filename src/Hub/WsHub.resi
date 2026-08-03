// Hub/WsHub — public interface
// Only register, unregister, and notifyReload are exposed (REQ-WH-8).
// The live-set state is private to this module.

let register: (Http.serverSocket) => unit
let unregister: (Http.serverSocket) => unit
let notifyReload: unit => unit
let closeAll: unit => unit

// test-only accessor — exposes the internal registered-client count for unit testing.
// NOT for production use — exists solely as a testing seam.
let _testGetRegisteredCount: unit => int

// test-only: reset all hub state. Use at the start of each hub unit test
// to guarantee a clean baseline (hub is a module-level singleton).
let _testResetHub: unit => unit
