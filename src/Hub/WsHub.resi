// Hub/WsHub — public interface
// Only register, unregister, notifyReload, and init are exposed (REQ-WH-8).
// The live-set state is private to this module.

let init: (~maxPerIp: int, ~maxGlobal: int) => unit

let register: (
  ~socket: Http.serverSocket,
  ~clientIp: string,
  ~onLifecycle: unit => unit,
) => result<unit, WsHub_Types.capRejected>

let unregister: (Http.serverSocket, string) => unit
let notifyReload: unit => unit
let closeAll: unit => unit

// test-only accessor — exposes the internal registered-client count for unit testing.
// NOT for production use — exists solely as a testing seam.
let _testGetRegisteredCount: unit => int

// test-only: reset all hub state. Use at the start of each hub unit test
// to guarantee a clean baseline (hub is a module-level singleton).
let _testResetHub: unit => unit
