// Handler.resi — static-file request handler pipeline.
// Faithful port of src/server/http.mts:256-490 per REQ-HANDLER-1..13.

type t = {handler: Http.handlerCb, drain: ref<bool>}
let make: Config.t => t

// handle is exported only for test seam access
let handle: (~probes: Probes.probeHandlers, ~config: Config.t, ~request: Types.request) => promise<Types.outcome>
