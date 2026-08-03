// Node/Process_spawn — swappable spawn seam for testing.
// Provides a mutable ref that tests can reassign to mock spawn behavior.
// REQ-RESTART-5: typed spawn external, zero %raw.

/// Spawn function signature matching Process.spawn.
type spawnFn = (string, array<string>, Process.spawnOptions) => Process.childProcess

/// Mutable spawn ref — defaults to Process.spawn but tests reassign this.
let spawn: ref<spawnFn> = ref(Process.spawn)

/// Wrapper that calls the current spawn ref.
let callSpawn = (~execPath: string, ~args: array<string>, ~opts: Process.spawnOptions): result<Process.childProcess, string> => {
  try {
    Ok(spawn.contents(execPath, args, opts))
  } catch {
  | e =>
    let msg = switch JsExn.message(Obj.magic(e)) {
    | Some(m) => m
    | None => "unknown spawn error"
    }
    Error(msg)
  }
}
