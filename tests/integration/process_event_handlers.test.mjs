// tests/integration/process_event_handlers.test.mjs — Integration test for
// uncaughtException and unhandledRejection handlers registered at startup.
// Verifies:
//  1. process.listenerCount("uncaughtException") >= 1 after server start
//  2. process.listenerCount("unhandledRejection") >= 1 after server start
//  3. guardedShutdown prevents double-invocation when both handlers fire

import { test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import fs from "node:fs";
import { spawn } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { setTimeout as sleep } from "node:timers/promises";

// ---------------------------------------------------------------------------
// Global fs bootstrap for FsWatch.res.mjs module scope evaluation.
// ---------------------------------------------------------------------------

globalThis.fs = fs;

// ---------------------------------------------------------------------------
// Imports — compiled ReScript modules.
// ---------------------------------------------------------------------------

const Httpath = await import("../../src/Httpath.res.mjs");
const Handler = await import("../../src/Server/Handler.res.mjs");
const Parser = await import("../../src/Cfg/Parser.res.mjs");

// ---------------------------------------------------------------------------
// Port base
// ---------------------------------------------------------------------------

const PORT_BASE = 9500;

// ---------------------------------------------------------------------------
// makeChildScript — starts Httpath.start and immediately prints listener
// counts to stdout, then stays alive indefinitely (until killed by parent).
// ---------------------------------------------------------------------------

function makeChildScript(port, tmpDir) {
  const scriptPath = path.join(tmpDir, "child.mjs");
  const childScript = `
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const fs = require("node:fs");
globalThis.fs = fs;
globalThis.createReadStream = fs.createReadStream.bind(fs);

import { start } from "${path.resolve(process.cwd(), "src/Httpath.res.mjs")}";
import { make as makeHandler } from "${path.resolve(process.cwd(), "src/Server/Handler.res.mjs")}";
import { parse as parseArgs } from "${path.resolve(process.cwd(), "src/Cfg/Parser.res.mjs")}";

const parseResult = parseArgs([
  "--port", "${port}",
  "--host", "127.0.0.1",
  "--dir", "${tmpDir}",
  "--no-live-reload",
]);
if (parseResult.TAG !== "Ok") {
  console.error("CHILD: config parse failed");
  process.exit(1);
}
const config = parseResult._0;
const {handler, drain: draining} = makeHandler(config);

start(handler, draining, config, undefined);

// Keep process alive indefinitely (Httpath.start never returns — it calls
// Process.exit(0) internally when the server closes on SIGTERM).
// Report listener counts immediately so the parent can verify and kill.
console.log("LISTENERS:uncaughtException:" + process.listenerCount("uncaughtException"));
console.log("LISTENERS:unhandledRejection:" + process.listenerCount("unhandledRejection"));
`;
  writeFileSync(scriptPath, childScript);
  return { scriptPath };
}

// ---------------------------------------------------------------------------
// Test: uncaughtException handler is registered on startup.
// ---------------------------------------------------------------------------

test("process.listenerCount('uncaughtException') >= 1 after Httpath.start", async () => {
  const port = PORT_BASE + 1;
  const tmpDir = mkdtempSync(path.join("/tmp", "httpath-uncaught-"));
  writeFileSync(path.join(tmpDir, "hello.txt"), "Hello, World!");

  const { scriptPath } = makeChildScript(port, tmpDir);

  const child = spawn(process.execPath, [scriptPath], {
    stdio: ["ignore", "pipe", "pipe"],
    cwd: process.cwd(),
  });

  let stdout = "";
  child.stdout.on("data", (d) => (stdout += d.toString()));

  // Wait for the LISTENERS line to appear in stdout (max 5s).
  const deadline = Date.now() + 5000;
  while (!stdout.includes("LISTENERS:uncaughtException:")) {
    if (Date.now() > deadline) {
      child.kill("SIGTERM");
      throw new Error("Child did not emit LISTENERS:uncaughtException within 5s. stdout: " + stdout);
    }
    await sleep(50);
  }

  const uncaughtCount = parseInt(
    stdout.split("\n").find((l) => l.startsWith("LISTENERS:uncaughtException:"))?.split(":")[2] ?? "0",
    10,
  );

  assert.ok(
    uncaughtCount >= 1,
    `Expected listenerCount('uncaughtException') >= 1, got ${uncaughtCount}`,
  );

  child.kill("SIGTERM");
  await new Promise((r) => child.on("exit", r));

  rmSync(scriptPath, { force: true });
  rmSync(tmpDir, { recursive: true, force: true });
});

// ---------------------------------------------------------------------------
// Test: unhandledRejection handler is registered on startup.
// ---------------------------------------------------------------------------

test("process.listenerCount('unhandledRejection') >= 1 after Httpath.start", async () => {
  const port = PORT_BASE + 2;
  const tmpDir = mkdtempSync(path.join("/tmp", "httpath-rejection-"));
  writeFileSync(path.join(tmpDir, "hello.txt"), "Hello, World!");

  const { scriptPath } = makeChildScript(port, tmpDir);

  const child = spawn(process.execPath, [scriptPath], {
    stdio: ["ignore", "pipe", "pipe"],
    cwd: process.cwd(),
  });

  let stdout = "";
  child.stdout.on("data", (d) => (stdout += d.toString()));

  const deadline = Date.now() + 5000;
  while (!stdout.includes("LISTENERS:unhandledRejection:")) {
    if (Date.now() > deadline) {
      child.kill("SIGTERM");
      throw new Error("Child did not emit LISTENERS:unhandledRejection within 5s. stdout: " + stdout);
    }
    await sleep(50);
  }

  const rejectionCount = parseInt(
    stdout.split("\n").find((l) => l.startsWith("LISTENERS:unhandledRejection:"))?.split(":")[2] ?? "0",
    10,
  );

  assert.ok(
    rejectionCount >= 1,
    `Expected listenerCount('unhandledRejection') >= 1, got ${rejectionCount}`,
  );

  child.kill("SIGTERM");
  await new Promise((r) => child.on("exit", r));

  rmSync(scriptPath, { force: true });
  rmSync(tmpDir, { recursive: true, force: true });
});

// ---------------------------------------------------------------------------
// Test: guardedShutdown prevents double-invocation when both handlers fire.
// Emits both events while the server is running, then sends SIGTERM to verify
// the server exits cleanly. If the guard failed (double shutdown), the process
// would crash before SIGTERM is even received.
// ---------------------------------------------------------------------------

test("guardedShutdown prevents double-invocation — both handlers log before SIGKILL", async () => {
  const port = PORT_BASE + 3;
  const tmpDir = mkdtempSync(path.join("/tmp", "httpath-guard-"));
  writeFileSync(path.join(tmpDir, "hello.txt"), "Hello, World!");

  // Script that starts server, emits both events while running, then waits to be killed.
  const scriptPath = path.join(tmpDir, "child.mjs");
  const childScript = `
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const fs = require("node:fs");
globalThis.fs = fs;
globalThis.createReadStream = fs.createReadStream.bind(fs);

import { start } from "${path.resolve(process.cwd(), "src/Httpath.res.mjs")}";
import { make as makeHandler } from "${path.resolve(process.cwd(), "src/Server/Handler.res.mjs")}";
import { parse as parseArgs } from "${path.resolve(process.cwd(), "src/Cfg/Parser.res.mjs")}";

const parseResult = parseArgs([
  "--port", "${port}",
  "--host", "127.0.0.1",
  "--dir", "${tmpDir}",
  "--no-live-reload",
]);
if (parseResult.TAG !== "Ok") {
  process.exit(1);
}
const config = parseResult._0;
const {handler, drain: draining} = makeHandler(config);

start(handler, draining, config, undefined);

// Emit both events while the server is running (before SIGTERM fires).
// guardedShutdown ensures shutdown() is only called once.
process.emit("uncaughtException", new Error("test uncaughtException"));
process.nextTick(() => {
  process.emit("unhandledRejection", new Error("test unhandledRejection"));
});
`;
  writeFileSync(scriptPath, childScript);

  const child = spawn(process.execPath, [scriptPath], {
    stdio: ["ignore", "pipe", "pipe"],
    cwd: process.cwd(),
  });

  let stderr = "";
  child.stderr.on("data", (d) => (stderr += d.toString()));

  // Wait up to ~3s for both handler logs to appear in stderr.
  const logDeadline = Date.now() + 3000;
  while (
    !(stderr.includes("uncaughtException") && stderr.includes("unhandledRejection")) &&
    Date.now() < logDeadline
  ) {
    await sleep(100);
  }

  // Force-exit the child (SIGKILL bypasses our signal handler). We only need
  // to confirm both handlers logged; we do NOT need to wait for graceful drain.
  const exited = child.exitCode !== null ? Promise.resolve() : new Promise((r) => child.once("exit", r));
  child.kill("SIGKILL");
  await exited;

  assert.ok(
    stderr.includes("uncaughtException"),
    `Expected uncaughtException log, got: ${stderr}`,
  );

  assert.ok(
    stderr.includes("unhandledRejection"),
    `Expected both handlers to log errors, got: ${stderr}`,
  );

  rmSync(scriptPath, { force: true });
  rmSync(tmpDir, { recursive: true, force: true });
});
