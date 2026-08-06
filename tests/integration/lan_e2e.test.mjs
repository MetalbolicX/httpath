// tests/integration/lan_e2e.test.mjs — Full LAN security E2E integration test.
// Tests the complete flow: --lan with auth, access log, rate limit, read-only.
// Uses node:test, spawns a real httpath server process.

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
// Global fs shim (same pattern as other lan_*.test.mjs)
// ---------------------------------------------------------------------------

globalThis.fs = fs;

// ---------------------------------------------------------------------------
// Imports — compiled ReScript modules (loaded after global fs is set).
// ---------------------------------------------------------------------------

const Httpath = await import("../../src/Httpath.res.mjs");
const Handler = await import("../../src/Server/Handler.res.mjs");
const Parser = await import("../../src/Cfg/Parser.res.mjs");

// ---------------------------------------------------------------------------
// Port base
// ---------------------------------------------------------------------------

const PORT_BASE = 19600;

// ---------------------------------------------------------------------------
// Auth file helper — generates a .httpath-auth line using node:crypto directly.
// This mimics what scripts/gen-auth.mjs produces.
// ---------------------------------------------------------------------------

function buildAuthLine(username, password) {
  const salt = randomBytes(16);
  const saltB64 = salt.toString("base64");
  const hash = scryptSync(password, salt, 64, { N: 16384, r: 8, p: 1 });
  const hashB64 = hash.toString("base64");
  return `${username}:N=16384,r=8,p=1$${saltB64}$${hashB64}`;
}

// ---------------------------------------------------------------------------
// Auth file fixture — creates a temp auth file and returns its path.
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
// makeChildScript — writes a child-process script that starts Httpath.start
// with Handler.make(config) wiring.
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
// waitForChildReady — poll TCP port until child is listening.
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
// httpGet — HTTP GET with optional Basic Auth headers.
// Returns { statusCode, headers, body }.
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
// httpRequest — generic HTTP request with custom method and headers.
// ---------------------------------------------------------------------------

function httpRequest(port, urlPath, options = {}) {
  return new Promise((resolve, reject) => {
    const req = http.request(
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
    if (options.body) req.write(options.body);
    req.end();
  });
}

// ---------------------------------------------------------------------------
// Full LAN security E2E test:
// - Spawn httpath with --lan, valid auth, --access-log, --rate-limit-max=10
// - Send: 5 valid requests (200), 5 invalid auth (401), 1 more (429), 1 POST (405)
// - Verify access log file contains all 12 lines in correct format
// - Verify all rejection codes appear in log
// ---------------------------------------------------------------------------

test("Full LAN security E2E: auth + rate limit + read-only + access log", async () => {
  await withAuthFile([buildAuthLine("alice", "secret")], async (authPath, tmpDir) => {
    // Create a test file to serve
    writeFileSync(path.join(tmpDir, "index.html"), "<h1>test</h1>", "utf8");

    // Access log file path
    const logPath = path.join(tmpDir, "access.log");

    const port = PORT_BASE + 1;

    // Spawn with --lan, valid auth, --access-log, --rate-limit-max=10
    // authFile is set to authPath so auth preflight passes
    const { scriptPath } = makeChildScript(port, tmpDir, JSON.stringify({
      lan: true,
      authFile: authPath,
      noAuth: false,
      accessLog: logPath,
      rateLimitEnabled: true,
      rateLimitMax: 10,
      rateLimitWindow: 60000, // 60 seconds
      readOnly: true,
    }));

    const child = spawn(process.execPath, [scriptPath], {
      stdio: ["ignore", "pipe", "pipe"],
      cwd: process.cwd(),
    });

    let stderr = "";
    child.stderr.on("data", (d) => (stderr += d.toString()));

    try {
      // Wait for server to start
      await new Promise((r) => setTimeout(r, 400));
      await waitForChildReady(child, port, 5000);

      // --- Phase 1: 5 valid requests → 200 ---
      for (let i = 0; i < 5; i++) {
        const res = await httpGet(port, "/index.html", {
          headers: { Authorization: "Basic " + Buffer.from("alice:secret").toString("base64") },
        });
        assert.strictEqual(res.statusCode, 200, `Valid request ${i + 1} should be 200, got ${res.statusCode}`);
      }

      // --- Phase 2: 5 invalid auth requests → 401 ---
      for (let i = 0; i < 5; i++) {
        const res = await httpGet(port, "/index.html", {
          headers: { Authorization: "Basic " + Buffer.from("alice:wrongpassword").toString("base64") },
        });
        assert.strictEqual(res.statusCode, 401, `Invalid auth ${i + 1} should be 401, got ${res.statusCode}`);
      }

      // --- Phase 3: 1 more request → 429 (rate limit exceeded) ---
      // Total requests so far: 5 valid + 5 invalid = 10, rate limit is 10
      const resRateLimit = await httpGet(port, "/index.html", {
        headers: { Authorization: "Basic " + Buffer.from("alice:secret").toString("base64") },
      });
      assert.strictEqual(resRateLimit.statusCode, 429, `Request 11 should be 429 rate limit, got ${resRateLimit.statusCode}`);
      // Verify Retry-After header is present
      const retryAfter = resRateLimit.headers["retry-after"];
      assert.ok(retryAfter, `429 response should have Retry-After header, got: ${JSON.stringify(resRateLimit.headers)}`);

      // --- Phase 4: 1 POST request → 405 (read-only) ---
      // Rate limit state may still be active, but read-only should trigger first
      // depending on gate ordering. If rate limit fires first it's still a valid rejection.
      const resPost = await httpRequest(port, "/index.html", {
        method: "POST",
        headers: {
          Authorization: "Basic " + Buffer.from("alice:secret").toString("base64"),
          "Content-Type": "text/plain",
        },
        body: "test data",
      });
      // POST should be 405 (read-only) or 429 (rate limit) — both are valid rejections
      assert.ok(
        resPost.statusCode === 405 || resPost.statusCode === 429,
        `POST should be 405 or 429, got ${resPost.statusCode}`,
      );

      // --- Phase 5: Verify access log file ---
      // Wait a moment for log writes to flush
      await new Promise((r) => setTimeout(r, 200));

      // Log should exist
      assert.ok(fs.existsSync(logPath), `Access log should exist at ${logPath}`);

      const logContent = fs.readFileSync(logPath, "utf8");
      const logLines = logContent.trim().split("\n").filter((l) => l.length > 0);

      // We expect 12 lines: 5x200 + 5x401 + 1x429 + 1x405
      assert.strictEqual(
        logLines.length,
        12,
        `Expected 12 log lines, got ${logLines.length}. Log:\n${logContent}`,
      );

      // Verify format: each line should match "ISO8601 | ip | method | path | status | bytes"
      // Example: "2026-08-04T07:44:10.000Z | 127.0.0.1 | GET | /index.html | 200 | 14"
      const iso8601Regex = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;
      for (const line of logLines) {
        const parts = line.split(" | ");
        assert.strictEqual(parts.length, 6, `Log line should have 6 fields: ${line}`);
        assert.ok(iso8601Regex.test(parts[0]), `First field should be ISO8601 timestamp: ${parts[0]}`);
        assert.ok(["127.0.0.1"].includes(parts[1]), `Second field should be IP: ${parts[1]}`);
        assert.ok(["GET", "POST"].includes(parts[2]), `Third field should be method: ${parts[2]}`);
        assert.strictEqual(parts[3], "/index.html", `Fourth field should be path: ${parts[3]}`);
        assert.ok(["200", "401", "405", "429"].includes(parts[4]), `Fifth field should be status code: ${parts[4]}`);
        assert.ok(/\d+/.test(parts[5]), `Sixth field should be bytes: ${parts[5]}`);
      }

      // Verify all rejection codes appear: 200 (5x), 401 (5x), 429 (1-2x), 405 (0-1x)
      // The POST request may be rejected by read-only (405) or rate-limit (429) first.
      const statusCounts = {};
      for (const line of logLines) {
        const status = line.split(" | ")[4];
        statusCounts[status] = (statusCounts[status] || 0) + 1;
      }
      assert.strictEqual(statusCounts["200"], 5, `Expected 5x 200, got ${statusCounts["200"]}`);
      assert.strictEqual(statusCounts["401"], 5, `Expected 5x 401, got ${statusCounts["401"]}`);
      assert.ok(
        (statusCounts["429"] || 0) >= 1 && (statusCounts["429"] || 0) <= 2,
        `Expected 1-2x 429, got ${statusCounts["429"]}`
      );
      assert.ok(
        (statusCounts["405"] || 0) >= 0 && (statusCounts["405"] || 0) <= 1,
        `Expected 0-1x 405, got ${statusCounts["405"]}`
      );
      assert.strictEqual(
        (statusCounts["429"] || 0) + (statusCounts["405"] || 0),
        2,
        `Expected 429+405 = 2, got ${(statusCounts["429"] || 0) + (statusCounts["405"] || 0)}`
      );

      // --- Phase 6: Verify bytes field for file GETs ---
      // The test fixture creates index.html with "<h1>test</h1>" (14 bytes).
      const indexFileSize = fs.statSync(path.join(tmpDir, "index.html")).size;
      assert.ok(indexFileSize > 0, "index.html fixture should be non-empty");

      const fileGetLines = logLines.filter((l) => {
        const parts = l.split(" | ");
        return parts[2] === "GET" && parts[3] === "/index.html" && parts[4] === "200";
      });
      assert.ok(fileGetLines.length >= 1, `Expected at least 1 GET /index.html 200 line, got ${fileGetLines.length}`);

      for (const line of fileGetLines) {
        const bytes = parseInt(line.split(" | ")[5], 10);
        assert.ok(
          bytes === indexFileSize,
          `GET /index.html bytes should be ${indexFileSize}, got ${bytes} in line: ${line}`,
        );
      }

      // Clean up
      child.kill("SIGTERM");
      await new Promise((r) => child.on("exit", r));
    } catch (e) {
      // Ensure child is cleaned up on failure
      if (child.exitCode === null) child.kill("SIGTERM");
      throw e; // Re-throw so node:test registers the failure
    } finally {
      await new Promise((r) => setTimeout(r, 100));
      rmSync(scriptPath, { force: true });
    }
  });
});
