// restart_test.mjs — behavioral tests for Restart.reload.
// Tests REQ-RESTART-1 through REQ-RESTART-4 using mocked spawn.
// Run with: node --env-file=retest.env.js tests/unit/restart_test.mjs
//
// process_fake.mjs is loaded via retest.env.js BEFORE any module runs.
// It stubs global process.exit so tests survive and can read exit codes
// via getLastExitCode(). process_fake.mjs must be loaded first.

import { getLastExitCode, resetExitCode } from "./process_fake.mjs";
import {
  installSpawnStubOk,
  installSpawnStubErr,
  restoreSpawn,
  resetHelpers,
  lastSpawnArgs,
  lastSpawnOpts,
  stubbedErrorLogs,
  installErrorStub,
  restoreError,
} from "./_helpers.mjs";

const Restart = await import("../../src/Watcher/Restart.res.mjs");

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    console.log(`✔ ${name}`);
    passed++;
  } catch (e) {
    console.log(`✖ ${name}`);
    console.log(`  ${e.message}`);
    failed++;
  }
}

function strictEqual(a, b, msg) {
  if (a !== b) throw new Error(`${msg}: got ${a}, expected ${b}`);
}

// ─── REQ-RESTART-1: argv preservation ────────────────────────────────────────

test("reload assembles [entrypoint, ...argv] and calls spawn (REQ-RESTART-1)", () => {
  resetHelpers();
  installSpawnStubOk();
  resetExitCode();

  Restart.reload("node", "bin.mjs", ["-p", "8080", "-d", "demo"]);

  strictEqual(lastSpawnArgs.execPath, "node", "execPath is node");
  strictEqual(
    lastSpawnArgs.args[0],
    "bin.mjs",
    "first spawn arg is entrypoint"
  );
  strictEqual(lastSpawnArgs.args[1], "-p", "second spawn arg is -p");
  strictEqual(lastSpawnArgs.args[2], "8080", "third spawn arg is 8080");
  strictEqual(lastSpawnArgs.args[3], "-d", "fourth spawn arg is -d");
  strictEqual(lastSpawnArgs.args[4], "demo", "fifth spawn arg is demo");
});

// ─── REQ-RESTART-2: stdio inheritance ────────────────────────────────────────

test("spawn uses stdio:inherit and shell:false (REQ-RESTART-2)", () => {
  resetHelpers();
  installSpawnStubOk();
  resetExitCode();

  Restart.reload("node", "bin.mjs", ["-p", "8080"]);

  strictEqual(lastSpawnOpts.stdio, "inherit", "stdio is inherit");
  strictEqual(lastSpawnOpts.shell, false, "shell is false");
});

// ─── REQ-RESTART-3: exit after spawn ─────────────────────────────────────────

test("Successful spawn calls Process.exit(0) immediately (REQ-RESTART-3)", () => {
  resetHelpers();
  installSpawnStubOk();
  resetExitCode();

  Restart.reload("node", "bin.mjs", []);

  strictEqual(getLastExitCode(), 0, "exit code is 0 on spawn success");
});

test("Synchronous spawn throw calls Process.exit(1) (REQ-RESTART-3)", () => {
  resetHelpers();
  installSpawnStubErr("spawn ENOENT");
  resetExitCode();
  const origError = installErrorStub();

  Restart.reload("/nonexistent/node", "bin.mjs", []);

  strictEqual(getLastExitCode(), 1, "exit code is 1 on spawn throw");
  restoreError(origError);
});

test("Spawn throw logs an error message (REQ-RESTART-3)", () => {
  resetHelpers();
  installSpawnStubErr("spawn ENOENT");
  resetExitCode();
  const origError = installErrorStub();

  Restart.reload("/nonexistent/node", "bin.mjs", []);

  const hasError = stubbedErrorLogs.some((l) => l.includes("[Restart]"));
  strictEqual(hasError, true, "console.error was called with [Restart] prefix");
  restoreError(origError);
});

// ─── REQ-RESTART-4: no signals, no debounce ───────────────────────────────────

test("reload does not register SIGINT handler (REQ-RESTART-4)", () => {
  resetHelpers();
  installSpawnStubOk();
  resetExitCode();

  const before = process.listeners("SIGINT").length;
  Restart.reload("node", "bin.mjs", []);
  const after = process.listeners("SIGINT").length;

  strictEqual(after, before, "no SIGINT handler added");
});

test("reload does not register SIGTERM handler (REQ-RESTART-4)", () => {
  resetHelpers();
  installSpawnStubOk();
  resetExitCode();

  const before = process.listeners("SIGTERM").length;
  Restart.reload("node", "bin.mjs", []);
  const after = process.listeners("SIGTERM").length;

  strictEqual(after, before, "no SIGTERM handler added");
});

test("Restart module exports only reload (REQ-RESTART-4)", () => {
  const keys = Object.keys(Restart);
  const hasExtra = keys.some((k) => k !== "reload");
  strictEqual(hasExtra, false, "only reload is exported");
});

// ─── Cleanup ───────────────────────────────────────────────────────────────────

restoreSpawn();

console.log(`\nℹ ${passed + failed} tests`);
console.log(`✔ ${passed} passed`);
if (failed > 0) {
  console.log(`✖ ${failed} failed`);
  process.exit(1);
}
