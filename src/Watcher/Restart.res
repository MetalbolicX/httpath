// Watcher/Restart — stateless process restart.
// REQ-RESTART-1 through REQ-RESTART-5.
//
// Responsibilities (strictly bounded per REQ-RESTART-4):
// - Assemble argv array for spawn.
// - Spawn the child process with inherited stdio.
// - Handle spawn errors (ENOENT, EACCES, etc.) at the boundary.
// - Exit the parent process after confirmed spawn.
// - Register ZERO signal handlers (Httpath owns signals).
// - Add ZERO debounce or cooldown (Monitor supplies it).
// - Create NO file watchers.

/// Spawn a new httpath process and exit the parent.
/// This is a fire-and-forget restart: the parent exits after the child is
/// confirmed spawned, delegating the server port to the child.
let reload = (~execPath: string, ~entrypoint: string, ~argv: array<string>): unit => {
  let childArgs = Array.concat([entrypoint], argv)

  // Attempt spawn. Synchronous failures (ENOENT, EACCES) throw from spawn.
  let spawnResult: result<Process.childProcess, JsExn.t> = try {
    Ok(Process.spawn(execPath, childArgs, {stdio: "inherit", shell: false}))
  } catch {
  | e => Error(Obj.magic(e))
  }

  switch spawnResult {
  | Error(_e) =>
    Console.error("[Restart] failed to spawn")
    Process.exit(1)
  | Ok(child) => {
    // Flag to prevent double-exit if both 'error' and 'exit' fire.
    let didExit = ref(false)
    let ensureExit = (code: int) => {
      if !didExit.contents {
        didExit := true
        Process.exit(code)
      }
    }

    // 'error' fires asynchronously for ENOENT, EACCES, and other spawn failures
    // AFTER spawn has returned (unlike synchronous throws caught above).
    let _ = Process.onError(child, (_err) => {
      Console.error("[Restart] subprocess error")
      ensureExit(1)
    })

    // 'exit' fires when the child process terminates.
    // On normal exit (code 0) the parent exits 0.
    // On abnormal exit (code != 0) the parent exits with the same code.
    let _ = Process.onChildExit(child, (code, _signal) => {
      switch code {
      | Some(c) if c != 0 => ensureExit(c)
      | _ => ensureExit(0)
      }
    })

    // Trigger spawn. The event handlers above will fire when the child
    // emits 'exit' or 'error'. This function returns immediately after
    // registering handlers; the parent process runs until one of them
    // calls Process.exit.
    ()
    }
  }
}
