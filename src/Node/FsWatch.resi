// FsWatch.resi — Node fs.watch bindings for the typed file watcher.

type watcher
type watchOptions = {recursive: bool}

@module("node:fs")
external _fsWatch: (string, watchOptions, (string, string) => unit) => watcher = "watch"

let startWatcher: (
  ~path: string,
  ~options: watchOptions,
  ~onEvent: Types.fsEvent => unit,
) => watcher

@send
external close: watcher => unit = "close"
