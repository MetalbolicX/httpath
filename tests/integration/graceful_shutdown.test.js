// tests/integration/graceful_shutdown.test.js — Integration test for graceful shutdown.
// Verifies that in-flight HTTP requests drain before Process.exit(0) on SIGTERM,
// and that the server exits with code 0.
//
// Coverage:
// - Slow HTTP request completes (drains) before shutdown
// - Server exits with code 0 on SIGTERM
// - No unclean shutdown (no reset/errors in stderr)

import { test } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import net from "node:net";
import path from "node:path";
import fs from "node:fs";
import { spawn } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";

// ---------------------------------------------------------------------------
// Global fs bootstrap for FsWatch.res.mjs module scope evaluation.
// ---------------------------------------------------------------------------

globalThis.fs = fs;

// ---------------------------------------------------------------------------
// Imports — compiled ReScript modules (loaded after global fs is set).
// ---------------------------------------------------------------------------

const Httpath = await import("../../src/Httpath.res.mjs");
const Handler = await import("../../src/Server/Handler.res.mjs");
const Parser = await import("../../src/Cfg/Parser.res.mjs");

// ---------------------------------------------------------------------------
// Port base — each test uses BASE + index to avoid EADDRINUSE conflicts.
// ---------------------------------------------------------------------------

const PORT_BASE = 9400;

// ---------------------------------------------------------------------------
// makeChildScript — writes a child-process script that starts Httpath.start
// with Handler.make(config) wiring. Returns { scriptPath, tmpDir }.
// ---------------------------------------------------------------------------

function makeChildScript(port, tmpDir, extraConfig) {
  const scriptPath = path.join(tmpDir, "child.mjs");
  const childScript = `
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const fs = require("node:fs");
// Fs.res.mjs uses globalThis.createReadStream (Deno global) — provide it for Node.js.
globalThis.fs = fs;
globalThis.createReadStream = fs.createReadStream.bind(fs);

import { start } from "${path.resolve(process.cwd(), "src/Httpath.res.mjs")}";
import { make as makeHandler } from "${path.resolve(process.cwd(), "src/Server/Handler.res.mjs")}";
import { parse as parseArgs } from "${path.resolve(process.cwd(), "src/Cfg/Parser.res.mjs")}";

// Build config via Parser.parse same way Httpath.main does.
const parseResult = parseArgs([
  "--port", "${port}",
  "--host", "127.0.0.1",
  "--dir", "${tmpDir}",
  "--no-live-reload",
]);
if (parseResult.TAG !== "Ok") {
  console.error("CHILD: config parse failed", parseResult);
  process.exit(1);
}

const config = ${extraConfig ? `Object.assign({}, parseResult._0, ${extraConfig})` : "parseResult._0"};

// Wire real Handler.make instead of 501 stub.
const handler = makeHandler(config);

start(handler, config);
`;
  writeFileSync(scriptPath, childScript);
  return { scriptPath };
}

// ---------------------------------------------------------------------------
// waitForChildReady — poll TCP port until child is listening.
// ---------------------------------------------------------------------------

function waitForChildReady(child, port, timeoutMs = 3000) {
  const deadline = Date.now() + timeoutMs;
  return new Promise((resolve, reject) => {
    const check = () => {
      if (child.exitCode !== null) {
        reject(new Error(`Child exited unexpectedly with code ${child.exitCode}`));
        return;
      }
      if (Date.now() >= deadline) {
        reject(new Error("Child did not become ready within " + timeoutMs + "ms"));
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
// httpGet — thin http.get wrapper returning { statusCode, body }.
// ---------------------------------------------------------------------------

function httpGet(port, urlPath, options = {}) {
  return new Promise((resolve, reject) => {
    const req = http.get(
      { hostname: "127.0.0.1", port, path: urlPath, method: options.method || "GET", headers: options.headers || {} },
      (res) => {
        let data = "";
        res.on("data", (chunk) => (data += chunk));
        res.on("end", () => resolve({ statusCode: res.statusCode, headers: res.headers, body: data }));
      },
    );
    req.on("error", reject);
    req.setTimeout(5000, () => { req.destroy(); reject(new Error("HTTP timeout")); });
  });
}

// ---------------------------------------------------------------------------
// Test: slow HTTP request completes before graceful shutdown (SIGTERM).
// Scenario:
//  1. Start server
//  2. Send a slow HTTP request (server will delay response)
//  3. While request is in-flight, send SIGTERM to child
//  4. Assert: the request completes with 200 (not reset)
//  5. Assert: child exits with code 0 within 5s
//  6. Assert: no stderr indicating unclean shutdown
// ---------------------------------------------------------------------------

test("slow HTTP request drains before graceful shutdown on SIGTERM → 200 + exit code 0", async () => {
  const port = PORT_BASE + 1;
  const tmpDir = mkdtempSync(path.join("/tmp", "httpath-shutdown-"));
  // Create a large file so reading it takes measurable time
  const largeContent = "x".repeat(64 * 1024); // 64KB
  writeFileSync(path.join(tmpDir, "large.txt"), largeContent);

  const { scriptPath } = makeChildScript(port, tmpDir, null);

  const child = spawn(process.execPath, [scriptPath], {
    stdio: ["ignore", "pipe", "pipe"],
    cwd: process.cwd(),
  });

  let stderr = "";
  child.stderr.on("data", (d) => (stderr += d.toString()));

  try {
    // Wait for server to be ready
    await new Promise((r) => setTimeout(r, 200));
    await waitForChildReady(child, port);

    // Start the HTTP request — the server will begin responding
    const reqPromise = httpGet(port, "/large.txt");

    // Give the server a moment to start writing the response
    await new Promise((r) => setTimeout(r, 50));

    // Now send SIGTERM — the server should finish serving the in-flight request
    child.kill("SIGTERM");

    // Wait for child to exit with a timeout
    const exitCode = await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error("Child did not exit within 5s after SIGTERM"));
      }, 5000);
      child.on("exit", (code) => {
        clearTimeout(timeout);
        resolve(code);
      });
    });

    // Try to get the response (it may have completed before SIGTERM)
    let response;
    try {
      response = await reqPromise;
    } catch {
      // Request may have been reset — this would indicate the bug we're testing against
      assert.fail("HTTP request was reset before completing — graceful drain FAILED");
    }

    // Assert: request completed with 200 (not reset)
    assert.strictEqual(
      response.statusCode,
      200,
      `Expected 200, got ${response.statusCode}. Request should complete (drain) before shutdown.`,
    );

    // Assert: child exited with code 0
    assert.strictEqual(
      exitCode,
      0,
      `Expected exit code 0, got ${exitCode}. Server should exit cleanly after draining.`,
    );

    // Assert: no stderr indicating errors or unclean shutdown
    assert.ok(
      !stderr.includes("Error") && !stderr.includes("Unhandled"),
      `Expected no errors in stderr, got: ${stderr}`,
    );
  } finally {
    if (child.exitCode === null) child.kill("SIGTERM");
    rmSync(scriptPath, { force: true });
    rmSync(tmpDir, { recursive: true, force: true });
  }
});

// ---------------------------------------------------------------------------
// Test: server exits cleanly with code 0 on SIGTERM with no in-flight requests.
// ---------------------------------------------------------------------------

test("server exits with code 0 on SIGTERM (no in-flight requests)", async () => {
  const port = PORT_BASE + 2;
  const tmpDir = mkdtempSync(path.join("/tmp", "httpath-shutdown-"));
  writeFileSync(path.join(tmpDir, "hello.txt"), "Hello, World!");

  const { scriptPath } = makeChildScript(port, tmpDir, null);

  const child = spawn(process.execPath, [scriptPath], {
    stdio: ["ignore", "pipe", "pipe"],
    cwd: process.cwd(),
  });

  let stderr = "";
  child.stderr.on("data", (d) => (stderr += d.toString()));

  try {
    await new Promise((r) => setTimeout(r, 200));
    await waitForChildReady(child, port);

    // Send SIGTERM immediately — no in-flight requests
    child.kill("SIGTERM");

    const exitCode = await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error("Child did not exit within 5s after SIGTERM"));
      }, 5000);
      child.on("exit", (code) => {
        clearTimeout(timeout);
        resolve(code);
      });
    });

    assert.strictEqual(
      exitCode,
      0,
      `Expected exit code 0, got ${exitCode}. Server should exit cleanly on SIGTERM.`,
    );

    assert.ok(
      !stderr.includes("Error") && !stderr.includes("Unhandled"),
      `Expected no errors in stderr, got: ${stderr}`,
    );
  } finally {
    if (child.exitCode === null) child.kill("SIGTERM");
    rmSync(scriptPath, { force: true });
    rmSync(tmpDir, { recursive: true, force: true });
  }
});

// ---------------------------------------------------------------------------
// Test: server exits cleanly with code 0 on SIGINT (Ctrl+C).
// ---------------------------------------------------------------------------

test("server exits with code 0 on SIGINT", async () => {
  const port = PORT_BASE + 3;
  const tmpDir = mkdtempSync(path.join("/tmp", "httpath-shutdown-"));
  writeFileSync(path.join(tmpDir, "hello.txt"), "Hello, World!");

  const { scriptPath } = makeChildScript(port, tmpDir, null);

  const child = spawn(process.execPath, [scriptPath], {
    stdio: ["ignore", "pipe", "pipe"],
    cwd: process.cwd(),
  });

  let stderr = "";
  child.stderr.on("data", (d) => (stderr += d.toString()));

  try {
    await new Promise((r) => setTimeout(r, 200));
    await waitForChildReady(child, port);

    // Send SIGINT (same as Ctrl+C)
    child.kill("SIGINT");

    const exitCode = await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error("Child did not exit within 5s after SIGINT"));
      }, 5000);
      child.on("exit", (code) => {
        clearTimeout(timeout);
        resolve(code);
      });
    });

    assert.strictEqual(
      exitCode,
      0,
      `Expected exit code 0, got ${exitCode}. Server should exit cleanly on SIGINT.`,
    );

    assert.ok(
      !stderr.includes("Error") && !stderr.includes("Unhandled"),
      `Expected no errors in stderr, got: ${stderr}`,
    );
  } finally {
    if (child.exitCode === null) child.kill("SIGTERM");
    rmSync(scriptPath, { force: true });
    rmSync(tmpDir, { recursive: true, force: true });
  }
});
