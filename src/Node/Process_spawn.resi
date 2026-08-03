// Node/Process_spawn — public interface.

/// Spawn function signature matching Process.spawn.
type spawnFn = (string, array<string>, Process.spawnOptions) => Process.childProcess

/// Mutable spawn ref — defaults to Process.spawn but tests reassign this.
let spawn: ref<spawnFn>

/// Call the current spawn ref.
let callSpawn: (~execPath: string, ~args: array<string>, ~opts: Process.spawnOptions) => result<Process.childProcess, string>
