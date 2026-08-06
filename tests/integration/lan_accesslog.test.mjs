// tests/integration/lan_accesslog.test.mjs — Access log stdout default under --lan.
// Verifies plan 020: --lan without --access-log defaults to stdout for access logs.
// Models after lan_e2e.test.mjs.

import { test } from "node:test";
import assert from "node:assert/strict";
import net from "node:net";
import path from "node:path";
import fs from "node:fs";
import { spawn } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { scryptSync, randomBytes } from "node:crypto";
import http from "node:http";

// ---------------------------------------------------------------------------
// Global fs shim
// ---------------------------------------------------------------------------

globalThis.fs = fs;

// ---------------------------------------------------------------------------
// Imports — compiled ReScript modules
// ---------------------------------------------------------------------------

const Httpath = await import("../../src/Httpath.res.mjs");
const Handler = await import("../../src/Server/Handler.res.mjs");
const Parser = await import("../../src/Cfg/Parser.res.mjs");

// ---------------------------------------------------------------------------
// Port base
// ---------------------------------------------------------------------------

const PORT_BASE = 19700;

// ---------------------------------------------------------------------------
// Auth file helper — inline scrypt, same format as scripts/gen-auth.mjs
// ---------------------------------------------------------------------------

function buildAuthLine(username, password) {
  const salt = randomBytes(16);
  const saltB64 = salt.toString("base64");
  const hash = scryptSync(password, salt, 64, { N: 16384, r: 8, p: 1 });
  const hashB64 = hash.toString("base64");
  return `${username}:N=16384,r=8,p=1$${saltB64}$${hashB64}`;
}

// ---------------------------------------------------------------------------
// Auth file fixture
// ---------------------------------------------------------------------------

async function withAuthFile(entries, callback) {
  const tmpDir = mkdtempSync(path.join("/tmp", "httpath-auth-"));
  const authPath = path.join(tmpDir, ".httpath-auth");
  writeFileSync(authPath, entries.join("\n") + "\n", "utf8");
  try {
    fs.chmodSync(authPath, 0o600);
  } catch (_) {}
  try {
    await callback(authPath, tmpDir);
  } finally {
    rmSync(authPath, { force: true });
    rmSync(tmpDir, { recursive: true, force: true });
  }
}

// ---------------------------------------------------------------------------
// makeChildScript — same pattern as lan_e2e.test.mjs
// ---------------------------------------------------------------------------

function makeChildScript(port, tmpDir, extraConfig) {
  const scriptPath = path.join(tmpDir, "child.mjs");
  const ABS_BASIC = path.resolve(process.cwd(), "src/Auth/Basic.res.mjs");
  const childScript = `
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const fs = require("node:fs");
globalThis.fs = fs;
globalThis.createReadStream = fs.createReadStream.bind(fs);

import { start } from "${path.resolve(process.cwd(), "src/Httpath.res.mjs")}";
import { make as makeHandler } from "${path.resolve(process.cwd(), "src/Server/Handler.res.mjs")}";
import { parse as parseArgs } from "${path.resolve(process.cwd(), "src/Cfg/Parser.res.mjs")}";
import { searchAuthFile as searchAuth } from "${ABS_BASIC}";

const parseResult = parseArgs([
  "--port", "${port}",
  "--host", "127.0.0.1",
  "--dir", "${tmpDir}",
  "--no-live-reload",
  "--log", "plain",
]);
if (parseResult.TAG !== "Ok") {
  console.error("CHILD: config parse failed", parseResult);
  process.exit(1);
}

const config = ${extraConfig ? `Object.assign({}, parseResult._0, ${extraConfig})` : "parseResult._0"};

// Load auth entries the same way Httpath.main does — see Httpath.res:191
let authEntries = null;
if (config.lan && !config.noAuth) {
  const entries = searchAuth(config.authFile, config.directory);
  if (entries === null) {
    console.error("CHILD: --lan requires auth file, none found at", config.directory);
    process.exit(1);
  }
  authEntries = entries;
}

const {handler, drain: draining} = makeHandler(config);
start(handler, draining, config, authEntries);
`;
  writeFileSync(scriptPath, childScript);
  return { scriptPath };
}

// ---------------------------------------------------------------------------
// waitForChildReady
// ---------------------------------------------------------------------------

function waitForChildReady(child, port, timeoutMs = 5000) {
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
// httpGet
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
    req.setTimeout(3000, () => { req.destroy(); reject(new Error("HTTP timeout")); });
  });
}

// ---------------------------------------------------------------------------
// hasAccessLogLine — returns true if the string contains an access log line.
// Access log format: "ISO8601 | ip | method | path | status | bytes | requestId | duration_ms"
// We check for the unique delimiter pattern " | " and a UUID-like requestId field.
// ---------------------------------------------------------------------------

function hasAccessLogLine(s) {
  // Each line has 7 " | " delimiters (8 fields). We look for lines containing
  // " | " repeated at least 3 times plus a UUID in field 7 (36-char hex-with-dashes).
  const lines = s.split("\n");
  for (const line of lines) {
    if (!line.trim()) continue;
    const parts = line.split(" | ");
    if (parts.length >= 7) {
      // requestId field (7th, index 6) should be a UUID
      if (parts[6] && parts[6].match(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/)) {
        return true;
      }
    }
  }
  return false;
}

// ---------------------------------------------------------------------------
// Case 1: LAN stdout default — --lan without --access-log emits to stdout
// ---------------------------------------------------------------------------

test("lan-accesslog: --lan without --access-log writes access logs to stdout", async () => {
  await withAuthFile([buildAuthLine("alice", "secret")], async (authPath, tmpDir) => {
    writeFileSync(path.join(tmpDir, "index.html"), "<h1>test</h1>", "utf8");

    const port = PORT_BASE + 1;

    // Start with --lan and no --access-log: should default to stdout
    const { scriptPath } = makeChildScript(port, tmpDir, JSON.stringify({
      lan: true,
      authFile: authPath,
      noAuth: false,
      // accessLog: intentionally omitted → defaults to None, which under --lan means Stdout
      noTls: true,
    }));

    const child = spawn(process.execPath, [scriptPath], {
      stdio: ["ignore", "pipe", "pipe"],
      cwd: process.cwd(),
    });

    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (d) => (stdout += d.toString()));
    child.stderr.on("data", (d) => (stderr += d.toString()));

    try {
      await new Promise((r) => setTimeout(r, 400));
      await waitForChildReady(child, port, 5000);

      // Make one valid request
      const res = await httpGet(port, "/index.html", {
        headers: { Authorization: "Basic " + Buffer.from("alice:secret").toString("base64") },
      });
      assert.strictEqual(res.statusCode, 200, `Expected 200, got ${res.statusCode}`);

      // Give the access log write time to flush
      await new Promise((r) => setTimeout(r, 200));

      // stdout should contain at least one access log line
      assert.ok(
        hasAccessLogLine(stdout),
        `Expected access log line in stdout under --lan, but stdout was:\n${stdout}`,
      );

      child.kill("SIGTERM");
      await new Promise((r) => child.on("exit", r));
    } catch (e) {
      if (child.exitCode === null) child.kill("SIGTERM");
      throw e;
    } finally {
      await new Promise((r) => setTimeout(r, 100));
      rmSync(scriptPath, { force: true });
    }
  });
});

// ---------------------------------------------------------------------------
// Case 2: Loopback off — no --lan, no --access-log → no access logging
// ---------------------------------------------------------------------------

test("lan-accesslog: loopback without --access-log has no access logs in stdout", async () => {
  await withAuthFile([buildAuthLine("alice", "secret")], async (authPath, tmpDir) => {
    writeFileSync(path.join(tmpDir, "index.html"), "<h1>test</h1>", "utf8");

    const port = PORT_BASE + 2;

    // Start WITHOUT --lan: loopback mode, no access log by default
    const { scriptPath } = makeChildScript(port, tmpDir, JSON.stringify({
      lan: false,
      authFile: authPath,
      noAuth: false,
      // accessLog: intentionally omitted → None, which on loopback means no logging
      noTls: true,
    }));

    const child = spawn(process.execPath, [scriptPath], {
      stdio: ["ignore", "pipe", "pipe"],
      cwd: process.cwd(),
    });

    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (d) => (stdout += d.toString()));
    child.stderr.on("data", (d) => (stderr += d.toString()));

    try {
      await new Promise((r) => setTimeout(r, 400));
      await waitForChildReady(child, port, 5000);

      // Make one valid request
      const res = await httpGet(port, "/index.html", {
        headers: { Authorization: "Basic " + Buffer.from("alice:secret").toString("base64") },
      });
      assert.strictEqual(res.statusCode, 200, `Expected 200, got ${res.statusCode}`);

      // Give any potential write time to flush
      await new Promise((r) => setTimeout(r, 200));

      // stdout should NOT contain access log lines
      // (application logs go to stderr; access logs go to stdout only when configured)
      assert.ok(
        !hasAccessLogLine(stdout),
        `Expected no access log lines in stdout on loopback, but stdout was:\n${stdout}`,
      );

      child.kill("SIGTERM");
      await new Promise((r) => child.on("exit", r));
    } catch (e) {
      if (child.exitCode === null) child.kill("SIGTERM");
      throw e;
    } finally {
      await new Promise((r) => setTimeout(r, 100));
      rmSync(scriptPath, { force: true });
    }
  });
});

// ---------------------------------------------------------------------------
// Case 3: File override — --lan --access-log <file> writes to file, NOT stdout
// ---------------------------------------------------------------------------

test("lan-accesslog: --lan --access-log <file> writes to file, not stdout", async () => {
  await withAuthFile([buildAuthLine("alice", "secret")], async (authPath, tmpDir) => {
    writeFileSync(path.join(tmpDir, "index.html"), "<h1>test</h1>", "utf8");

    const port = PORT_BASE + 3;
    const logPath = path.join(tmpDir, "access.log");

    // Start with --lan and explicit --access-log: should write to file only
    const { scriptPath } = makeChildScript(port, tmpDir, JSON.stringify({
      lan: true,
      authFile: authPath,
      noAuth: false,
      accessLog: logPath,
      noTls: true,
    }));

    const child = spawn(process.execPath, [scriptPath], {
      stdio: ["ignore", "pipe", "pipe"],
      cwd: process.cwd(),
    });

    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (d) => (stdout += d.toString()));
    child.stderr.on("data", (d) => (stderr += d.toString()));

    try {
      await new Promise((r) => setTimeout(r, 400));
      await waitForChildReady(child, port, 5000);

      // Make one valid request
      const res = await httpGet(port, "/index.html", {
        headers: { Authorization: "Basic " + Buffer.from("alice:secret").toString("base64") },
      });
      assert.strictEqual(res.statusCode, 200, `Expected 200, got ${res.statusCode}`);

      // Give the access log write time to flush
      await new Promise((r) => setTimeout(r, 200));

      // Log file should contain access log lines
      assert.ok(fs.existsSync(logPath), `Access log file should exist at ${logPath}`);
      const logContent = fs.readFileSync(logPath, "utf8");
      assert.ok(
        hasAccessLogLine(logContent),
        `Expected access log lines in log file, but content was:\n${logContent}`,
      );

      // stdout should NOT contain access log lines (file wins)
      assert.ok(
        !hasAccessLogLine(stdout),
        `Expected no access log lines in stdout when --access-log is set, but stdout was:\n${stdout}`,
      );

      child.kill("SIGTERM");
      await new Promise((r) => child.on("exit", r));
    } catch (e) {
      if (child.exitCode === null) child.kill("SIGTERM");
      throw e;
    } finally {
      await new Promise((r) => setTimeout(r, 100));
      rmSync(scriptPath, { force: true });
    }
  });
});
