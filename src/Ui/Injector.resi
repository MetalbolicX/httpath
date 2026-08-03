// Injector.resi — interface for Ui/Injector per REQ-INJECTOR-2..3.

let liveReloadScript: (~port: int) => string
let injectLiveReloadScript: (~html: string, ~port: int) => string
