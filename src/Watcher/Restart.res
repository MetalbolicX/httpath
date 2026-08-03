// Watcher/Restart — stateless process restart.
// REQ-RESTART-1 through REQ-RESTART-5.
//
// Responsibilities (strictly bounded per REQ-RESTART-4):
// - Assemble argv array for spawn.
// - Spawn the child process with inherited stdio.
// - Handle spawn errors (ENOENT, EACCES, etc.) at the boundary.
// - Exit the parent process immediately after confirmed spawn (not after child exits).
// - Register ZERO signal handlers (Httpath owns signals).
// - Add ZERO debounce or cooldown (Monitor supplies it).
// - Create NO file watchers.

/// Spawn a new httpath process and exit the parent.
/// Per REQ-RESTART-3 "Success": parent exits 0 immediately after spawn succeeds,
/// not after the child terminates (httpath runs forever so child-exit would hang).
let reload = (~execPath: string, ~entrypoint: string, ~argv: array<string>): unit => {
  let childArgs = Array.concat([entrypoint], argv)

  // Attempt spawn via the swappable seam. Try-catch handles synchronous throws
  // (ENOENT, EACCES). Async errors from the child are not handled since the
  // parent exits immediately on success (REQ-RESTART-3).
  let spawnResult: result<Process.childProcess, string> = try {
    Ok(Process_spawn.spawn.contents(execPath, childArgs, {stdio: "inherit", shell: false}))
  } catch {
  | e =>
    let msg = switch JsExn.message(Obj.magic(e)) {
    | Some(m) => m
    | None => "unknown spawn error"
    }
    Error(msg)
  }

  switch spawnResult {
  | Error(_msg) =>
    Console.error("[Restart] failed to spawn")
    Process.exit(1)
  | Ok(_child) =>
    // REQ-RESTART-3 "Success": exit immediately after confirmed spawn.
    // The child inherits stdio from the parent and runs independently.
    Process.exit(0)
  }
}
