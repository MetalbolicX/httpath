// Httpath.resi — public interface for the lifecycle coordinator.
// Httpath owns the signal handlers; Monitor does not register them.
// req-APP-1, APP-2, APP-3, APP-4.

/// Parse Process.argv and run the full lifecycle.
/// Exits 0 on help, exits 1 on parse error.
let main: unit => promise<unit>

/// Start the HTTP server + Monitor with the given handler and config.
/// Returns only after shutdown (signal received or abort triggered).
/// The handler is typically a static-file handler; until that lands,
/// a 501 fallback is used internally.
let start: (~handler: Http.handlerCb, ~config: Config.t) => promise<unit>
