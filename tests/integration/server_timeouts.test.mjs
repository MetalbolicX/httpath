// tests/integration/server_timeouts.test.mjs — HTTP server timeout/connection config.
//
// WHAT THIS TEST VERIFIES (testable in Node.js v24):
// 1. Node_Process.getInt reads env vars and applies defaults (test 1).
// 2. Malformed env vars fall back to defaults with a warning (test 2).
// 3. A normal HTTP request completes successfully under aggressive timeout config (test 3).
//
// WHAT THIS TEST DOES NOT VERIFY (Node.js v24 limitations):
// - headersTimeout / requestTimeout are Node.js INACTIVITY timeouts, not wall-clock slowloris
//   timeouts. A client sending bytes faster than the timeout keeps the connection alive
//   indefinitely. Slowloris-style trickle is NOT prevented by these settings.
// - maxConnections is documented as "for cluster workers only" in Node.js v24; the property
//   is set on the server but is a no-op for non-cluster servers. OS-level fd limits are the
//   real backstop.
// - The values are still set to reasonable defaults so they take effect when clients go idle
//   (the common case), and so the config is in place if/when Node.js changes semantics.
//
// The test verifies the env-var read path by having the child print the resolved value via
// Node_Process.getInt to stderr; the parent asserts the match.

import { test } from "node:test";
import assert from "node:assert/strict";
import net from "node:net";
import path from "node:path";
import fs from "node:fs";
import { spawn } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";

globalThis.fs = fs;

const Httpath = await import("../../src/Httpath.res.mjs");
const Handler = await import("../../src/Server/Handler.res.mjs");
const Parser = await import("../../src/Cfg/Parser.res.mjs");

const PORT_BASE = 19700;

// Child script calls Node_Process.getInt directly to verify the env-var read path,
// then starts the server. Stderr is captured by the parent.
function makeChildScript(port, tmpDir, envVars) {
  const scriptPath = path.join(tmpDir, "child.mjs");
  const envStr = Object.entries(envVars)
    .map(([k, v]) => `${k}=${JSON.stringify(v)}`)
    .join(",");
  const childScript = `
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const fs = require("node:fs");
globalThis.fs = fs;
globalThis.createReadStream = fs.createReadStream.bind(fs);

import { start } from "${path.resolve(process.cwd(), "src/Httpath.res.mjs")}";
import { make as makeHandler } from "${path.resolve(process.cwd(), "src/Server/Handler.res.mjs")}";
import { parse as parseArgs } from "${path.resolve(process.cwd(), "src/Cfg/Parser.res.mjs")}";
import { getInt } from "${path.resolve(process.cwd(), "src/Node/Node_Process.res.mjs")}";

// Verify env-var read path
const maxConnections = getInt("HTTPATH_MAX_CONNECTIONS", 1024);
const requestTimeout = getInt("HTTPATH_REQUEST_TIMEOUT", 30000);
const headersTimeout = getInt("HTTPATH_HEADERS_TIMEOUT", 32000);
const keepAliveTimeout = getInt("HTTPATH_KEEP_ALIVE_TIMEOUT", 5000);
console.error("[httpath-test] maxConnections=" + maxConnections);
console.error("[httpath-test] requestTimeout=" + requestTimeout);
console.error("[httpath-test] headersTimeout=" + headersTimeout);
console.error("[httpath-test] keepAliveTimeout=" + keepAliveTimeout);

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

const config = parseResult._0;
const handler = makeHandler(config);
start(handler, config, null);
`;
  writeFileSync(scriptPath, childScript);
  return { scriptPath };
}

function waitForChildReady(child, port, timeoutMs = 5000, stderrRef = null) {
  const deadline = Date.now() + timeoutMs;
  return new Promise((resolve, reject) => {
    const check = () => {
      if (child.exitCode !== null) {
        const msg = `Child exited unexpectedly with code ${child.exitCode}` + (stderrRef ? `\nstderr: ${stderrRef.value}` : "");
        reject(new Error(msg));
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
// Test 1: env vars are read and resolved to integer values.
// ---------------------------------------------------------------------------

test("server: Node_Process.getInt reads env vars correctly", async () => {
  const tmpDir = mkdtempSync(path.join("/tmp", "httpath-timeouts-"));
  writeFileSync(path.join(tmpDir, "index.html"), "<h1>test</h1>", "utf8");

  const port = PORT_BASE + 1;
  const { scriptPath } = makeChildScript(port, tmpDir, {});

  const child = spawn(process.execPath, [scriptPath], {
    stdio: ["ignore", "pipe", "pipe"],
    cwd: process.cwd(),
    env: {
      ...process.env,
      HTTPATH_MAX_CONNECTIONS: "789",
      HTTPATH_REQUEST_TIMEOUT: "12345",
      HTTPATH_HEADERS_TIMEOUT: "23456",
      HTTPATH_KEEP_ALIVE_TIMEOUT: "3456",
    },
  });

  let stderr = "";
  child.stderr.on("data", (d) => (stderr += d.toString()));

  try {
    await new Promise((r) => setTimeout(r, 400));
    await waitForChildReady(child, port, 5000);

    assert.match(stderr, /\[httpath-test\] maxConnections=789/, `stderr: ${stderr}`);
    assert.match(stderr, /\[httpath-test\] requestTimeout=12345/, `stderr: ${stderr}`);
    assert.match(stderr, /\[httpath-test\] headersTimeout=23456/, `stderr: ${stderr}`);
    assert.match(stderr, /\[httpath-test\] keepAliveTimeout=3456/, `stderr: ${stderr}`);

    child.kill("SIGTERM");
    await new Promise((r) => child.on("exit", r));
  } catch (e) {
    if (child.exitCode === null) child.kill("SIGTERM");
    throw e;
  } finally {
    await new Promise((r) => setTimeout(r, 100));
    rmSync(scriptPath, { force: true });
    rmSync(tmpDir, { recursive: true, force: true });
  }
});

// ---------------------------------------------------------------------------
// Test 2: malformed env var falls back to default with a warning.
// ---------------------------------------------------------------------------

test("server: Node_Process.getInt warns and falls back on malformed env var", async () => {
  const tmpDir = mkdtempSync(path.join("/tmp", "httpath-timeouts-"));
  writeFileSync(path.join(tmpDir, "index.html"), "<h1>test</h1>", "utf8");

  const port = PORT_BASE + 2;
  const { scriptPath } = makeChildScript(port, tmpDir, {});

  const child = spawn(process.execPath, [scriptPath], {
    stdio: ["ignore", "pipe", "pipe"],
    cwd: process.cwd(),
    env: { ...process.env, HTTPATH_MAX_CONNECTIONS: "not-a-number" },
  });

  let stderr = "";
  child.stderr.on("data", (d) => (stderr += d.toString()));

  try {
    await new Promise((r) => setTimeout(r, 400));
    await waitForChildReady(child, port, 5000);

    assert.match(
      stderr,
      /HTTPATH_MAX_CONNECTIONS="not-a-number" is not a valid integer; using default 1024/,
      `Expected warning about malformed env var, got: ${stderr}`,
    );
    assert.match(stderr, /\[httpath-test\] maxConnections=1024/, `Expected default 1024, got: ${stderr}`);

    child.kill("SIGTERM");
    await new Promise((r) => child.on("exit", r));
  } catch (e) {
    if (child.exitCode === null) child.kill("SIGTERM");
    throw e;
  } finally {
    await new Promise((r) => setTimeout(r, 100));
    rmSync(scriptPath, { force: true });
    rmSync(tmpDir, { recursive: true, force: true });
  }
});

// ---------------------------------------------------------------------------
// Test 3: normal request completes under aggressive timeout config.
// ---------------------------------------------------------------------------

test("server: normal request succeeds with aggressive timeout configuration", async () => {
  const tmpDir = mkdtempSync(path.join("/tmp", "httpath-timeouts-"));
  writeFileSync(path.join(tmpDir, "index.html"), "<h1>test</h1>", "utf8");

  const port = PORT_BASE + 3;
  const { scriptPath } = makeChildScript(port, tmpDir, {});

  const child = spawn(process.execPath, [scriptPath], {
    stdio: ["ignore", "pipe", "pipe"],
    cwd: process.cwd(),
    env: {
      ...process.env,
      HTTPATH_REQUEST_TIMEOUT: "1000",
      HTTPATH_HEADERS_TIMEOUT: "2000",
      HTTPATH_KEEP_ALIVE_TIMEOUT: "500",
      HTTPATH_MAX_CONNECTIONS: "100",
    },
  });

  let stderr = "";
  child.stderr.on("data", (d) => (stderr += d.toString()));

  try {
    await new Promise((r) => setTimeout(r, 400));
    await waitForChildReady(child, port, 5000);

    const response = await new Promise((resolve, reject) => {
      const req = net.createConnection({ host: "127.0.0.1", port }, () => {
        req.write("GET /index.html HTTP/1.1\r\nHost: localhost\r\nConnection: close\r\n\r\n");
      });
      let buf = "";
      req.on("data", (d) => (buf += d.toString()));
      req.on("end", () => resolve(buf));
      req.on("error", reject);
      req.setTimeout(2000, () => reject(new Error("Request timed out")));
    });

    assert.match(response, /HTTP\/1\.[01] 200/, `Expected 200 OK, got: ${response.slice(0, 200)}`);

    child.kill("SIGTERM");
    await new Promise((r) => child.on("exit", r));
  } catch (e) {
    if (child.exitCode === null) child.kill("SIGTERM");
    throw e;
  } finally {
    await new Promise((r) => setTimeout(r, 100));
    rmSync(scriptPath, { force: true });
    rmSync(tmpDir, { recursive: true, force: true });
  }
});
