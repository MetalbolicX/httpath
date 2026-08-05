// tests/integration/lan_read_only.test.mjs — Integration tests for read-only enforcement under --lan.
// Full wiring (read-only check in Handler.res) is Task 6.
// Tests:
// - `--lan`, GET/HEAD → 200
// - `--lan`, POST/PUT/DELETE/PATCH → 405 with Allow: GET, HEAD
// - `127.0.0.1` (no --lan), POST → 405 (same as today — behavior unchanged)
// Uses node:test, spawns real server processes.
// This file was refactored to use real Handler.make(config) instead of a fake handler.

import { test } from "node:test";
import assert from "node:assert/strict";
import net from "node:net";
import path from "node:path";
import fs from "node:fs";
import { spawn } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import http from "node:http";

// ---------------------------------------------------------------------------
// Global fs shim (same pattern as static_handler.test.js)
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

const PORT_BASE = 19400;

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

// Wire real Handler.make instead of fake handler.
const handler = makeHandler(config);

start(handler, config, undefined);
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
// httpGet — thin http.get wrapper returning { statusCode, headers, body }.
// ---------------------------------------------------------------------------

function httpGet(port, urlPath, options = {}) {
  return new Promise((resolve, reject) => {
    const req = http.get(
      {
        hostname: "127.0.0.1",
        port,
        path: urlPath,
        method: options.method || "GET",
        headers: options.headers || {},
      },
      (res) => {
        let data = "";
        res.on("data", (chunk) => (data += chunk));
        res.on("end", () => resolve({ statusCode: res.statusCode, headers: res.headers, body: data }));
      },
    );
    req.on("error", reject);
    req.setTimeout(2000, () => { req.destroy(); reject(new Error("HTTP timeout")); });
  });
}

// ---------------------------------------------------------------------------
// Test: --lan, GET /index.html → 200
// ---------------------------------------------------------------------------

test("--lan, GET returns 200", async () => {
  const port = PORT_BASE + 1;
  const tmpDir = mkdtempSync(path.join("/tmp", "httpath-readonly-"));
  writeFileSync(path.join(tmpDir, "index.html"), "<h1>test</h1>", "utf8");

  const { scriptPath } = makeChildScript(port, tmpDir, "{ readOnly: true, noAuth: true }");

  const child = spawn(process.execPath, [scriptPath], {
    stdio: ["ignore", "pipe", "pipe"],
    cwd: process.cwd(),
  });
  let stderr = "";
  child.stderr.on("data", (d) => (stderr += d.toString()));

  try {
    await new Promise((r) => setTimeout(r, 200));
    await waitForChildReady(child, port, 2000);

    const res = await httpGet(port, "/index.html");

    assert.strictEqual(res.statusCode, 200, `Expected 200, got ${res.statusCode}`);
  } finally {
    if (child.exitCode === null) { child.kill("SIGTERM"); }
    await new Promise((r) => setTimeout(r, 100));
    rmSync(scriptPath, { force: true });
    rmSync(tmpDir, { recursive: true, force: true });
  }
});

// ---------------------------------------------------------------------------
// Test: --lan, HEAD /index.html → 200
// ---------------------------------------------------------------------------

test("--lan, HEAD returns 200", async () => {
  const port = PORT_BASE + 2;
  const tmpDir = mkdtempSync(path.join("/tmp", "httpath-readonly-"));
  writeFileSync(path.join(tmpDir, "index.html"), "<h1>test</h1>", "utf8");

  const { scriptPath } = makeChildScript(port, tmpDir, "{ readOnly: true, noAuth: true }");

  const child = spawn(process.execPath, [scriptPath], {
    stdio: ["ignore", "pipe", "pipe"],
    cwd: process.cwd(),
  });
  let stderr = "";
  child.stderr.on("data", (d) => (stderr += d.toString()));

  try {
    await new Promise((r) => setTimeout(r, 200));
    await waitForChildReady(child, port, 2000);

    const res = await httpGet(port, "/index.html", { method: "HEAD" });

    assert.strictEqual(res.statusCode, 200, `Expected 200, got ${res.statusCode}`);
  } finally {
    if (child.exitCode === null) { child.kill("SIGTERM"); }
    await new Promise((r) => setTimeout(r, 100));
    rmSync(scriptPath, { force: true });
    rmSync(tmpDir, { recursive: true, force: true });
  }
});

// ---------------------------------------------------------------------------
// Helper: test 405 with Allow header for a given method under --lan
// ---------------------------------------------------------------------------

async function testWriteMethodRejected(port, method, tmpDir) {
  const { scriptPath } = makeChildScript(port, tmpDir, "{ readOnly: true, noAuth: true }");

  const child = spawn(process.execPath, [scriptPath], {
    stdio: ["ignore", "pipe", "pipe"],
    cwd: process.cwd(),
  });

  try {
    await new Promise((r) => setTimeout(r, 200));
    await waitForChildReady(child, port, 2000);

    const res = await httpGet(port, "/index.html", { method });

    assert.strictEqual(res.statusCode, 405, `${method} should return 405, got ${res.statusCode}`);

    const allowHeader = res.headers["allow"];
    assert.ok(allowHeader, `Expected Allow header, got none. Headers: ${JSON.stringify(res.headers)}`);
    assert.ok(allowHeader.includes("GET"), `Allow header should include GET: ${allowHeader}`);
    assert.ok(allowHeader.includes("HEAD"), `Allow header should include HEAD: ${allowHeader}`);
  } finally {
    if (child.exitCode === null) { child.kill("SIGTERM"); }
    await new Promise((r) => setTimeout(r, 100));
    rmSync(scriptPath, { force: true });
  }
}

// ---------------------------------------------------------------------------
// Test: --lan, POST /index.html → 405 + Allow: GET, HEAD
// ---------------------------------------------------------------------------

test("--lan, POST returns 405 with Allow header", async () => {
  const port = PORT_BASE + 3;
  const tmpDir = mkdtempSync(path.join("/tmp", "httpath-readonly-"));
  writeFileSync(path.join(tmpDir, "index.html"), "<h1>test</h1>", "utf8");
  await testWriteMethodRejected(port, "POST", tmpDir);
  rmSync(tmpDir, { recursive: true, force: true });
});

// ---------------------------------------------------------------------------
// Test: --lan, PUT /index.html → 405 + Allow: GET, HEAD
// ---------------------------------------------------------------------------

test("--lan, PUT returns 405 with Allow header", async () => {
  const port = PORT_BASE + 4;
  const tmpDir = mkdtempSync(path.join("/tmp", "httpath-readonly-"));
  writeFileSync(path.join(tmpDir, "index.html"), "<h1>test</h1>", "utf8");
  await testWriteMethodRejected(port, "PUT", tmpDir);
  rmSync(tmpDir, { recursive: true, force: true });
});

// ---------------------------------------------------------------------------
// Test: --lan, DELETE /index.html → 405 + Allow: GET, HEAD
// ---------------------------------------------------------------------------

test("--lan, DELETE returns 405 with Allow header", async () => {
  const port = PORT_BASE + 5;
  const tmpDir = mkdtempSync(path.join("/tmp", "httpath-readonly-"));
  writeFileSync(path.join(tmpDir, "index.html"), "<h1>test</h1>", "utf8");
  await testWriteMethodRejected(port, "DELETE", tmpDir);
  rmSync(tmpDir, { recursive: true, force: true });
});

// ---------------------------------------------------------------------------
// Test: --lan, PATCH /index.html → 405 + Allow: GET, HEAD
// ---------------------------------------------------------------------------

test("--lan, PATCH returns 405 with Allow header", async () => {
  const port = PORT_BASE + 6;
  const tmpDir = mkdtempSync(path.join("/tmp", "httpath-readonly-"));
  writeFileSync(path.join(tmpDir, "index.html"), "<h1>test</h1>", "utf8");
  await testWriteMethodRejected(port, "PATCH", tmpDir);
  rmSync(tmpDir, { recursive: true, force: true });
});

// ---------------------------------------------------------------------------
// Test: 127.0.0.1 (no --lan), POST /index.html → 405 (same as today)
// This verifies we did NOT change localhost behavior.
// ---------------------------------------------------------------------------

test("127.0.0.1 (no --lan), POST returns 405 (unchanged behavior)", async () => {
  const port = PORT_BASE + 7;
  const tmpDir = mkdtempSync(path.join("/tmp", "httpath-readonly-"));
  writeFileSync(path.join(tmpDir, "index.html"), "<h1>test</h1>", "utf8");

  // No readOnly flag, just default localhost behavior
  const { scriptPath } = makeChildScript(port, tmpDir, null);

  const child = spawn(process.execPath, [scriptPath], {
    stdio: ["ignore", "pipe", "pipe"],
    cwd: process.cwd(),
  });

  try {
    await new Promise((r) => setTimeout(r, 200));
    await waitForChildReady(child, port, 2000);

    const res = await httpGet(port, "/index.html", { method: "POST" });

    // Same as today — should still be 405 (method not supported by static handler)
    assert.strictEqual(res.statusCode, 405, `Expected 405, got ${res.statusCode}`);
  } finally {
    if (child.exitCode === null) { child.kill("SIGTERM"); }
    await new Promise((r) => setTimeout(r, 100));
    rmSync(scriptPath, { force: true });
    rmSync(tmpDir, { recursive: true, force: true });
  }
});

// ---------------------------------------------------------------------------
// Test: 127.0.0.1, GET /index.html → 200 (no read-only banner)
// ---------------------------------------------------------------------------

test("127.0.0.1 (no --lan), GET returns 200", async () => {
  const port = PORT_BASE + 8;
  const tmpDir = mkdtempSync(path.join("/tmp", "httpath-readonly-"));
  writeFileSync(path.join(tmpDir, "index.html"), "<h1>test</h1>", "utf8");

  const { scriptPath } = makeChildScript(port, tmpDir, null);

  const child = spawn(process.execPath, [scriptPath], {
    stdio: ["ignore", "pipe", "pipe"],
    cwd: process.cwd(),
  });

  try {
    await new Promise((r) => setTimeout(r, 200));
    await waitForChildReady(child, port, 2000);

    const res = await httpGet(port, "/index.html");

    assert.strictEqual(res.statusCode, 200, `Expected 200, got ${res.statusCode}`);
  } finally {
    if (child.exitCode === null) { child.kill("SIGTERM"); }
    await new Promise((r) => setTimeout(r, 100));
    rmSync(scriptPath, { force: true });
    rmSync(tmpDir, { recursive: true, force: true });
  }
});
