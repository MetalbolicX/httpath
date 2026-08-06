// tests/integration/protected_dir.test.mjs — Integration test for protected-directory startup guard.
// Verifies plan 011 § B4 acceptance criteria: cases 1–3.
// Uses node:test, spawns a real httpath server process.

import { test } from "node:test";
import assert from "node:assert/strict";
import net from "node:net";
import path from "node:path";
import fs from "node:fs";
import { spawn } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { randomBytes } from "node:crypto";

// ---------------------------------------------------------------------------
// Global fs shim (same pattern as other lan_*.test.mjs)
// ---------------------------------------------------------------------------

globalThis.fs = fs;

// ---------------------------------------------------------------------------
// Imports — compiled ReScript modules
// ---------------------------------------------------------------------------

const Httpath = await import("../../src/Httpath.res.mjs");
const Parser = await import("../../src/Cfg/Parser.res.mjs");

// ---------------------------------------------------------------------------
// Port base
// ---------------------------------------------------------------------------

const PORT_BASE = 19680;

// ---------------------------------------------------------------------------
// waitForChildReady — poll TCP port until child is listening.
// ---------------------------------------------------------------------------

function waitForChildReady(port, timeoutMs = 8000) {
  const deadline = Date.now() + timeoutMs;
  return new Promise((resolve, reject) => {
    const check = () => {
      if (Date.now() >= deadline) {
        reject(new Error("Server did not become ready within " + timeoutMs + "ms"));
        return;
      }
      const sock = net.createConnection({ host: "127.0.0.1", port });
      sock.setTimeout(200);
      sock.on("connect", () => { sock.destroy(); resolve(); });
      sock.on("error", () => { sock.destroy(); setTimeout(check, 50); });
      sock.on("timeout", () => { sock.destroy(); setTimeout(check, 50); });
    };
    check();
  });
}

// ---------------------------------------------------------------------------
// Case 1: -d /etc (no --allow-protected-dir) → exits non-zero with refusal.
// REF: plan 011 § "Escape hatch UX".
// ---------------------------------------------------------------------------

test("protected-dir: /etc without --allow-protected-dir refuses with actionable message", async () => {
  const port = PORT_BASE + 1;
  const tmpDir = mkdtempSync(path.join("/tmp", "httpath-prot-"));
  const binPath = path.resolve(process.cwd(), "bin.mjs");

  const child = spawn(process.execPath, [
    binPath,
    "-d", "/etc",
    "-p", String(port),
    "--host", "127.0.0.1",
    "--no-live-reload",
  ], {
    stdio: ["ignore", "pipe", "pipe"],
    cwd: process.cwd(),
  });

  let stderr = "";
  child.stderr.on("data", (d) => (stderr += d.toString()));

  let stdout = "";
  child.stdout.on("data", (d) => (stdout += d.toString()));

  try {
    // Child should exit non-zero within 8s.
    const exitCode = await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error("Child did not exit within 8s")), 8000);
      child.on("exit", (code) => { clearTimeout(timer); resolve(code); });
    });

    assert.strictEqual(exitCode, 1, `Expected exit code 1, got ${exitCode}\nstderr: ${stderr}`);

    // stderr must contain the refusal message.
    assert.ok(
      stderr.includes("refusing to serve a protected system directory"),
      `stderr should contain refusal message, got: ${stderr}`,
    );

    // stderr must mention the escape hatch.
    assert.ok(
      stderr.includes("--allow-protected-dir"),
      `stderr should mention --allow-protected-dir escape hatch, got: ${stderr}`,
    );

    // stdout should be empty (no startup banner).
    assert.strictEqual(stdout, "", `Expected no stdout output, got: ${stdout}`);
  } finally {
    if (child.exitCode === null) child.kill("SIGTERM");
    await new Promise((r) => setTimeout(r, 100));
    rmSync(tmpDir, { recursive: true, force: true });
  }
});

// ---------------------------------------------------------------------------
// Case 2: -d /etc --allow-protected-dir → starts with loud WARNING.
// REF: plan 011 § "The three behaviors at the boundary".
// ---------------------------------------------------------------------------

test("protected-dir: /etc with --allow-protected-dir starts with WARNING", async () => {
  const port = PORT_BASE + 2;
  const tmpDir = mkdtempSync(path.join("/tmp", "httpath-prot-"));
  const binPath = path.resolve(process.cwd(), "bin.mjs");

  const child = spawn(process.execPath, [
    binPath,
    "-d", "/etc",
    "-p", String(port),
    "--host", "127.0.0.1",
    "--no-live-reload",
    "--allow-protected-dir",
  ], {
    stdio: ["ignore", "pipe", "pipe"],
    cwd: process.cwd(),
  });

  let stderr = "";
  child.stderr.on("data", (d) => (stderr += d.toString()));

  try {
    // Wait for server to start listening.
    await waitForChildReady(port, 8000);

    // stderr must contain WARNING about the protected directory.
    assert.ok(
      stderr.toLowerCase().includes("warning"),
      `stderr should contain WARNING, got: ${stderr}`,
    );
    assert.ok(
      stderr.includes("/etc") || stderr.toLowerCase().includes("etc"),
      `stderr should mention /etc, got: ${stderr}`,
    );
  } finally {
    if (child.exitCode === null) child.kill("SIGTERM");
    await new Promise((r) => setTimeout(r, 200));
    rmSync(tmpDir, { recursive: true, force: true });
  }
});

// ---------------------------------------------------------------------------
// Case 3: -d /tmp/<random> → starts silently (not protected).
// REF: plan 011 § "The three behaviors at the boundary".
// ---------------------------------------------------------------------------

test("protected-dir: /tmp/<random> starts silently (not protected)", async () => {
  const port = PORT_BASE + 3;
  const tmpDir = mkdtempSync(path.join("/tmp", "httpath-prot-"));

  // Create a test file to serve.
  writeFileSync(path.join(tmpDir, "index.html"), "<h1>test</h1>", "utf8");

  const binPath = path.resolve(process.cwd(), "bin.mjs");

  const child = spawn(process.execPath, [
    binPath,
    "-d", tmpDir,
    "-p", String(port),
    "--host", "127.0.0.1",
    "--no-live-reload",
  ], {
    stdio: ["ignore", "pipe", "pipe"],
    cwd: process.cwd(),
  });

  let stderr = "";
  child.stderr.on("data", (d) => (stderr += d.toString()));

  try {
    // Wait for server to start listening.
    await waitForChildReady(port, 8000);

    // stderr must NOT contain warning for a non-protected dir.
    // (It may contain "Serving..." banner but not "WARNING").
    const hasWarning = stderr.toLowerCase().includes("warning");
    assert.ok(
      !hasWarning,
      `stderr should not contain warning for non-protected dir, got: ${stderr}`,
    );
  } finally {
    if (child.exitCode === null) child.kill("SIGTERM");
    await new Promise((r) => setTimeout(r, 100));
    rmSync(tmpDir, { recursive: true, force: true });
  }
});
