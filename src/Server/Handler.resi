// Handler.resi — static-file request handler pipeline.
// Faithful port of src/server/http.mts:256-490 per REQ-HANDLER-1..13.

let make: Config.t => Http.handlerCb

// handle is exported only for test seam access
let handle: (Config.t, Types.request) => promise<Types.outcome>
