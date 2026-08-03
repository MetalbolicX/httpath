// Watcher/Restart — public interface.
// Stateless subprocess restart: spawns a new httpath process and exits the parent.
// No signal handlers, no debounce, no file watching (per REQ-RESTART-4).

/// Spawn a new httpath process with the given arguments and exit the parent.
/// - execPath: path to the Node.js runtime (Process.execPath).
/// - entrypoint: script to run (e.g. "bin.mjs").
/// - argv: user-supplied CLI arguments to preserve (e.g. Process.argv[2..]).
let reload: (~execPath: string, ~entrypoint: string, ~argv: array<string>) => unit
