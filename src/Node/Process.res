// Node/Process — strict-typed external for Node.js process global.

@scope("process") @val external exit: int => unit = "exit"
@scope("process") @val external argv: array<string> = "argv"
@scope("process") @val external cwd: unit => string = "cwd"
@scope("process") @val external execPath: string = "execPath"

// child_process bindings — typed externals, zero %raw.
type childProcess
type spawnOptions = {stdio: string, shell: bool}

@module("node:child_process")
external spawn: (string, array<string>, spawnOptions) => childProcess = "spawn"

@send external _onExit: (childProcess, string, (Nullable.t<int>, Nullable.t<string>) => unit) => childProcess = "on"

@send external _onError: (childProcess, string, (Nullable.t<JsExn.t>) => unit) => childProcess = "on"

let onChildExit = (child: childProcess, callback: (option<int>, option<string>) => unit): unit => {
  let _ = _onExit(child, "exit", (code, signal) => {
    callback(Nullable.toOption(code), Nullable.toOption(signal))
  })
}

let onError = (child: childProcess, callback: JsExn.t => unit): unit => {
  let _ = _onError(child, "error", (e) => {
    switch Nullable.toOption(e) {
    | Some(err) => callback(err)
    | None => ()
    }
  })
}

// ---------------------------------------------------------------------------
// spawnSync — synchronous subprocess invocation (fixed argv, shell:false).
// Used for openssl version check and cert generation.
// ---------------------------------------------------------------------------

type spawnSyncResult = {
  status: int,
  stdout: Buffer.t,
  stderr: Buffer.t,
}

@module("node:child_process")
external spawnSync: (string, array<string>) => spawnSyncResult = "spawnSync"
