// _helpers.mjs — spawn stubs for Restart.reload behavioral tests.
// NOTE: process_fake.mjs (loaded via --env-file=retest.env.js) intercepts
// process.exit before this file or Process.res.mjs loads.

import * as Process_spawn from "../../src/Node/Process_spawn.res.mjs";

export const originalSpawnContents = Process_spawn.spawn.contents;

export let lastSpawnArgs = null;
export let lastSpawnOpts = null;
export let stubbedErrorLogs = [];

export function makeFakeChild() {
  return { pid: 12345 };
}

export function installSpawnStubOk() {
  Process_spawn.spawn.contents = (execPath, args, opts) => {
    lastSpawnArgs = { execPath, args };
    lastSpawnOpts = opts;
    return makeFakeChild();
  };
}

export function installSpawnStubErr(_msg) {
  Process_spawn.spawn.contents = (_execPath, _args, _opts) => {
    throw new Error("spawn ENOENT");
  };
}

export function restoreSpawn() {
  Process_spawn.spawn.contents = originalSpawnContents;
}

export function resetHelpers() {
  lastSpawnArgs = null;
  lastSpawnOpts = null;
  stubbedErrorLogs = [];
}

export function installErrorStub() {
  const originalError = console.error;
  console.error = (...args) => {
    stubbedErrorLogs.push(args.join(" "));
  };
  return originalError;
}

export function restoreError(originalError) {
  console.error = originalError;
}
