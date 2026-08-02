// FsWatch.resi — Node fs.watch bindings for the typed file watcher.

type watcher
type watchOptions = {recursive: bool}

@scope("fs")
@val
external _fsWatch: (string, watchOptions, (string, string) => unit) => watcher = "watch"

let startWatcher: (
  ~path: string,
  ~options: watchOptions,
  ~onEvent: (Types.fsEvent) => unit,
) => watcher

@send
external close: watcher => unit = "close"

let close: watcher => unit
