// FsWatch.res — Node fs.watch bindings for the typed file watcher.
// Bridges Node's (eventType, filename) callback to the typed fsEvent variant.

type watcher
type watchOptions = {recursive: bool}

// Re-export fsEvent from Types so Monitor can use the same variant type
// (Avoids duplication; FsWatch IS part of the watcher layer)
@module("node:fs")
external _fsWatch: (string, watchOptions, (string, string) => unit) => watcher = "watch"

// startWatcher — wraps FsWatch.watch, converts Node's (string, string) callback
// to the typed Types.fsEvent => unit that Monitor expects.
// The ~onEvent param shadows the external name so Monitor passes it correctly.
let startWatcher: (
  ~path: string,
  ~options: watchOptions,
  ~onEvent: Types.fsEvent => unit,
) => watcher = (~path, ~options, ~onEvent) => {
  let wrappedCallback = (eventType: string, filename: string) => {
    let event: Types.fsEvent = switch eventType {
    | "rename" => Types.Modified(filename)
    | "change" => Types.Modified(filename)
    | _ => Other
    }
    onEvent(event)
  }
  _fsWatch(path, options, wrappedCallback)
}

// close — calls watcher.close() to stop the watcher.
// FSWatcher has no file descriptor; the only way to stop it is the .close() method.
@send
external close: watcher => unit = "close"
