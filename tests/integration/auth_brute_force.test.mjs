// tests/integration/auth_brute_force.test.mjs — Integration tests for Basic Auth
// brute-force throttling (Plan 038).
// After maxFailures consecutive wrong passwords, the IP is locked for
// authLockoutMs. Each subsequent failure doubles the lockout (capped).
// After lockout expires, correct credentials are accepted again.

import { test } from "node:test";
import assert from "node:assert/strict";
import net from "node:net";
import path from "node:path";
import fs from "node:fs";
import { spawn } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { scryptSync, randomBytes } from "node:crypto";
import http from "node:http";

globalThis.fs = fs;

const Httpath = await import("../../src/Httpath.res.mjs");
const Handler = await import("../../src/Server/Handler.res.mjs");
const Parser = await import("../../src/Cfg/Parser.res.mjs");
const Basic = await import("../../src/Auth/Basic.res.mjs");

const PORT_BASE = 19500;

function buildAuthLine(username, password) {
  const salt = randomBytes(16);
  const saltB64 = salt.toString("base64");
  const hash = scryptSync(password, salt, 64, { N: 16384, r: 8, p: 1 });
  const hashB64 = hash.toString("base64");
  return `${username}:N=16384,r=8,p=1$${saltB64}$${hashB64}`;
}

async function withAuthFile(entries, callback) {
  const tmpDir = mkdtempSync(path.join("/tmp", "httpath-bruteforce-"));
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

function makeChildScript(port, tmpDir, authFile, extraFlags = "") {
  const scriptPath = path.join(tmpDir, "child.mjs");
  const ABS_HTTPATH = path.resolve(process.cwd(), "src/Httpath.res.mjs");
  const ABS_HANDLER = path.resolve(process.cwd(), "src/Server/Handler.res.mjs");
  const ABS_PARSER = path.resolve(process.cwd(), "src/Cfg/Parser.res.mjs");
  const ABS_BASIC = path.resolve(process.cwd(), "src/Auth/Basic.res.mjs");
  const childScript = `
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const fs = require("node:fs");
globalThis.fs = fs;
globalThis.createReadStream = fs.createReadStream.bind(fs);

import { start } from "${ABS_HTTPATH}";
import { make as makeHandler } from "${ABS_HANDLER}";
import { parse as parseArgs } from "${ABS_PARSER}";
import { searchAuthFile as searchAuth } from "${ABS_BASIC}";

const parseResult = parseArgs([
  "--port", "${port}",
  "--host", "127.0.0.1",
  "--dir", "${tmpDir}",
  "--no-live-reload",
  "--no-tls",
  "--lan",
  "--auth-max-failures", "3",
  "--auth-lockout-ms", "1000",
  "--rate-limit-max", "10000",
  "--rate-limit-window", "60",
  ${extraFlags}
]);
if (parseResult.TAG !== "Ok") {
  console.error("CHILD: config parse failed", parseResult);
  process.exit(1);
}

const config = parseResult._0;

let authEntries = null;
if (config.lan && !config.noAuth) {
  const entries = searchAuth(config.authFile, config.directory);
  if (entries === null) {
    console.error("CHILD: --lan requires auth file, none found");
    process.exit(1);
  }
  authEntries = entries;
}

const {handler, drain} = makeHandler(config);
start(handler, drain, config, authEntries);
`;
  writeFileSync(scriptPath, childScript);
  return { scriptPath };
}

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
// Test: 3 wrong-password requests → 4th correct-password request gets 429
// (locked). After lockout expires, correct credentials are accepted.
// ---------------------------------------------------------------------------

test("--auth-max-failures=3: lockout after 3 failures; correct creds blocked; expiry → accept", async () => {
  const port = PORT_BASE + 1;
  await withAuthFile([buildAuthLine("alice", "secret")], async (authPath, tmpDir) => {
    writeFileSync(path.join(tmpDir, "index.html"), "<h1>ok</h1>", "utf8");

    const { scriptPath } = makeChildScript(
      port,
      tmpDir,
      authPath,
      `"--auth-file", "${authPath}"`,
    );
    const child = spawn(process.execPath, [scriptPath], {
      stdio: ["ignore", "pipe", "pipe"],
      cwd: process.cwd(),
    });

    try {
      await new Promise((r) => setTimeout(r, 200));
      await waitForChildReady(child, port, 2000);

      // --- 3 wrong-password requests → all 401 ---
      for (let i = 0; i < 3; i++) {
        const res = await httpGet(port, "/index.html", {
          headers: { Authorization: "Basic " + Buffer.from("alice:wrong").toString("base64") },
        });
        assert.strictEqual(
          res.statusCode,
          401,
          `Wrong-password request #${i + 1} should be 401, got ${res.statusCode}`,
        );
      }

      // --- 4th request (correct password) → 429 (locked, not 401, not 200) ---
      const locked = await httpGet(port, "/index.html", {
        headers: { Authorization: "Basic " + Buffer.from("alice:secret").toString("base64") },
      });
      assert.strictEqual(
        locked.statusCode,
        429,
        `After 3 failures, correct creds should be 429 (locked), got ${locked.statusCode}`,
      );
      assert.ok(
        locked.headers["retry-after"] !== undefined,
        `Locked response should have Retry-After header, got ${JSON.stringify(locked.headers)}`,
      );

      // --- Wait for lockout to expire (1000ms + slack) ---
      await new Promise((r) => setTimeout(r, 1200));

      // --- Correct credentials now accepted → 200 ---
      const recovered = await httpGet(port, "/index.html", {
        headers: { Authorization: "Basic " + Buffer.from("alice:secret").toString("base64") },
      });
      assert.strictEqual(
        recovered.statusCode,
        200,
        `After lockout expiry, correct creds should be 200, got ${recovered.statusCode}`,
      );

      child.kill("SIGTERM");
      await new Promise((r) => child.on("exit", r));
    } finally {
      if (child.exitCode === null) { child.kill("SIGTERM"); }
      await new Promise((r) => setTimeout(r, 100));
      rmSync(scriptPath, { force: true });
    }
  });
});