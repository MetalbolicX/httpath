// Httpath.resi — public interface for the lifecycle coordinator.
// Httpath owns the signal handlers; Monitor does not register them.
// req-APP-1, APP-2, APP-3, APP-4.

/// Parse Process.argv and run the full lifecycle.
/// Exits 0 on help, exits 1 on parse error.
let main: unit => promise<unit>

/// Start the HTTP/HTTPS server + Monitor with the given handler and config.
/// TLS is activated automatically when config.tls is true.
/// `draining` is the shared ref SIGTERM sets to make /readyz return 503.
/// Returns only after shutdown (signal received or abort triggered).
let start: (
  ~handler: Http.handlerCb,
  ~draining: ref<bool>,
  ~config: Config.t,
  ~authEntries: option<array<Basic.entry>>,
) => promise<unit>
