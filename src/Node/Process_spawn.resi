// Node/Process_spawn — public interface.

/// Spawn function signature matching Process.spawn.
type spawnFn = (string, array<string>, Process.spawnOptions) => Process.childProcess

/// Mutable spawn ref — defaults to Process.spawn but tests reassign this.
let spawn: ref<spawnFn>
