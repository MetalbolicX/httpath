// Node/Process — public interface

let exit: int => unit
let argv: array<string>
let cwd: unit => string
let execPath: string

// child_process typed bindings
type childProcess
type spawnOptions = {stdio: string, shell: bool}

let spawn: (string, array<string>, spawnOptions) => childProcess
let onChildExit: (childProcess, (option<int>, option<string>) => unit) => unit
let onError: (childProcess, JsExn.t => unit) => unit
