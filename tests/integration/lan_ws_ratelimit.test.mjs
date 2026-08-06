// tests/integration/lan_ws_ratelimit.test.mjs — Integration test for WebSocket
// rate-limit short-circuit fix in gateWs (Plan 016).
// Tests that a WS upgrade with valid credentials is rejected after rate limit
// is exhausted, and that normal WS upgrades under the limit still work.

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
// Global fs shim (same pattern as other integration tests).
// ---------------------------------------------------------------------------

globalThis.fs = fs;

// ---------------------------------------------------------------------------
// Imports — compiled ReScript modules.
// ---------------------------------------------------------------------------

const Httpath = await import("../../src/Httpath.res.mjs");
const Handler = await import("../../src/Server/Handler.res.mjs");
const Parser = await import("../../src/Cfg/Parser.res.mjs");
const Basic = await import("../../src/Auth/Basic.res.mjs");

// ---------------------------------------------------------------------------
// Port base.
// ---------------------------------------------------------------------------

const PORT_BASE = 19400;

// ---------------------------------------------------------------------------
// Auth file helper.
// ---------------------------------------------------------------------------

function buildAuthLine(username, password) {
  const salt = randomBytes(16);
  const saltB64 = salt.toString("base64");
  const hash = scryptSync(password, salt, 64, { N: 16384, r: 8, p: 1 });
  const hashB64 = hash.toString("base64");
  return `${username}:N=16384,r=8,p=1$${saltB64}$${hashB64}`;
}

// ---------------------------------------------------------------------------
// Auth file fixture.
// ---------------------------------------------------------------------------

async function withAuthFile(entries, callback) {
  const tmpDir = mkdtempSync(path.join("/tmp", "httpath-wsrl-"));
  const authPath = path.join(tmpDir, ".httpath-auth");
  writeFileSync(authPath, entries.join("\n") + "\n", "utf8");
  try { fs.chmodSync(authPath, 0o600); } catch (_) {}
  try {
    await callback(authPath, tmpDir);
  } finally {
    rmSync(authPath, { force: true });
    rmSync(tmpDir, { recursive: true, force: true });
  }
}

// ---------------------------------------------------------------------------
// makeChildScript — starts Httpath with Handler.make wiring.
// ---------------------------------------------------------------------------

function makeChildScript(port, tmpDir, extraConfig) {
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
  "--rate-limit-max", "2",
  "--rate-limit-window", "60000",
]);
if (parseResult.TAG !== "Ok") {
  console.error("CHILD: config parse failed", parseResult);
  process.exit(1);
}

const config = Object.assign({}, parseResult._0, ${JSON.stringify(extraConfig)});

let authEntries = null;
if (config.lan && !config.noAuth) {
  const entries = searchAuth(config.authFile, config.directory);
  if (entries === null) {
    console.error("CHILD: --lan requires auth file, none found at", config.directory);
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

// ---------------------------------------------------------------------------
// waitForChildReady.
// ---------------------------------------------------------------------------

function waitForChildReady(child, port, timeoutMs = 3000) {
  const deadline = Date.now() + timeoutMs;
  return new Promise((resolve, reject) => {
    const check = () => {
      if (child.exitCode !== null) {
        reject(new Error("Child exited unexpectedly with code " + child.exitCode));
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

function httpGet(port, urlPath) {
  return new Promise((resolve, reject) => {
    const req = http.get(
      {
        hostname: "127.0.0.1",
        port,
        path: urlPath,
        method: "GET",
        headers: {},
      },
      (res) => {
        let data = "";
        res.on("data", (chunk) => { data += chunk; });
        res.on("end", () => resolve({ statusCode: res.statusCode, headers: res.headers, body: data }));
      },
    );
    req.on("error", reject);
    req.setTimeout(3000, () => { req.destroy(); reject(new Error("HTTP timeout")); });
  });
}

// ---------------------------------------------------------------------------
// wsUpgrade — raw TCP WS upgrade helper. Resolves on socket close with response
// data (may be empty). Follows lan_auth.test.mjs pattern: resolves on error
// (server-closed connection is expected when server rejects upgrade).
// ---------------------------------------------------------------------------

function wsUpgrade(port, authHeader) {
  return new Promise((resolve) => {
    const sock = net.createConnection({ host: "127.0.0.1", port });
    let data = "";
    const timeout = setTimeout(() => {
      sock.destroy();
      resolve(data);
    }, 3000);
    sock.on("data", (chunk) => { data += chunk.toString(); });
    sock.on("end", () => {
      clearTimeout(timeout);
      resolve(data);
    });
    sock.on("error", () => {
      clearTimeout(timeout);
      resolve(data);
    });
    const req = [
      "GET / HTTP/1.1",
      "Host: 127.0.0.1",
      "Upgrade: websocket",
      "Connection: upgrade",
      authHeader ? "Authorization: " + authHeader : "",
      "", "",
    ].filter(Boolean).join("\r\n") + "\r\n";
    sock.write(req);
  });
}

// ---------------------------------------------------------------------------
// Test: WS upgrade with valid auth under rate limit succeeds.
// ---------------------------------------------------------------------------

test("--lan: WS upgrade with valid credentials succeeds when under rate limit", async () => {
  const port = PORT_BASE + 0;
  await withAuthFile([buildAuthLine("alice", "secret")], async (authPath, tmpDir) => {
    const { scriptPath } = makeChildScript(port, tmpDir, {
      lan: true,
      authFile: authPath,
      noAuth: false,
    });
    const child = spawn(process.execPath, [scriptPath], {
      stdio: ["ignore", "pipe", "pipe"],
      cwd: process.cwd(),
    });

    let stderr = "";
    child.stderr.on("data", (d) => { stderr += d.toString(); });

    try {
      await new Promise((r) => setTimeout(r, 300));
      await waitForChildReady(child, port, 3000);

      // First WS upgrade — should succeed (not rate-limited yet)
      const authHeader = "Basic " + Buffer.from("alice:secret").toString("base64");
      const data = await wsUpgrade(port, authHeader);
      // Server accepted upgrade. The endpoint is not a real WS handler, so it
      // returns 200 (or the handler rejects the upgrade). The key: NOT 401/429.
      assert.ok(
        !data.includes("HTTP/1.1 401") && !data.includes("429"),
        "WS under limit should not be rejected, got: " + data.slice(0, 100),
      );

      child.kill("SIGTERM");
      await new Promise((r) => child.on("exit", r));
    } finally {
      if (child.exitCode === null) child.kill("SIGTERM");
      await new Promise((r) => setTimeout(r, 100));
      rmSync(scriptPath, { force: true });
    }
  });
});

// ---------------------------------------------------------------------------
// Test: WS upgrade with valid credentials is REJECTED after rate limit is
// exhausted (the bug this plan fixes: before the fix, auth would succeed and
// continue() would be called even after a 429 was sent).
// ---------------------------------------------------------------------------

test("--lan: WS upgrade with valid credentials is rejected after rate limit exhausted", async () => {
  const port = PORT_BASE + 1;
  await withAuthFile([buildAuthLine("alice", "secret")], async (authPath, tmpDir) => {
    const { scriptPath } = makeChildScript(port, tmpDir, {
      lan: true,
      authFile: authPath,
      noAuth: false,
    });
    const child = spawn(process.execPath, [scriptPath], {
      stdio: ["ignore", "pipe", "pipe"],
      cwd: process.cwd(),
    });

    let stderr = "";
    child.stderr.on("data", (d) => { stderr += d.toString(); });

    try {
      await new Promise((r) => setTimeout(r, 300));
      await waitForChildReady(child, port, 3000);

      // Exhaust the rate limit: 3 HTTP requests from the same IP.
      // Limit is 2, so 3rd request should get 429.
      for (let i = 0; i < 3; i++) {
        const res = await httpGet(port, "/");
        if (i === 2) {
          assert.strictEqual(
            res.statusCode,
            429,
            "3rd HTTP request should be rate-limited (429), got: " + res.statusCode,
          );
        }
      }

      // Now attempt WS upgrade with valid credentials — must be REJECTED.
      // Before the fix, continue() was called after rate-limit rejection,
      // allowing the upgrade to proceed.
      const authHeader = "Basic " + Buffer.from("alice:secret").toString("base64");
      const data = await wsUpgrade(port, authHeader);

      // Must receive 429 — not 101 Switching Protocols.
      assert.ok(
        data.includes("429") || data === "",
        "Rate-limited WS upgrade should be rejected (429 or closed), got: " + data.slice(0, 100),
      );
      // Must NOT receive 101.
      assert.ok(
        !data.includes("101"),
        "Rate-limited WS upgrade should NOT get 101 Switching Protocols, got: " + data.slice(0, 100),
      );

      child.kill("SIGTERM");
      await new Promise((r) => child.on("exit", r));
    } finally {
      if (child.exitCode === null) child.kill("SIGTERM");
      await new Promise((r) => setTimeout(r, 100));
      rmSync(scriptPath, { force: true });
    }
  });
});
