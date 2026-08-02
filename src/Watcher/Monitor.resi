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
