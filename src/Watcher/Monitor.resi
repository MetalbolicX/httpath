// Monitor.resi — public interface for the typed file watcher.

type handle

let start: (
  ~dir: string,
  ~ignorePatterns: array<string>,
  ~enableLiveReload: bool,
  ~restartOnChange: bool,
  ~onReload: unit => unit,
  ~onRestart: unit => unit,
) => handle

let cancel: handle => unit

// test-only: inject a synthetic file-change event directly into the Monitor's
// internal event path. Used by unit tests to exercise debounce, dispatch,
// re-entrancy, and cooldown without requiring a real filesystem.
let _testEmit: (handle, Types.fsEvent) => unit
