// Hub/WsHub — public interface
// Only register, unregister, and notifyReload are exposed (REQ-WH-8).
// The live-set state is private to this module.

let register: (Http.serverSocket) => unit
let unregister: (Http.serverSocket) => unit
let notifyReload: unit => unit
