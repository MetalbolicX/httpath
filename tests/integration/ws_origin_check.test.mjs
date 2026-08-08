// tests/integration/ws_origin_check.test.mjs — Integration test for WebSocket
// Origin validation under --lan (Plan 037).
// Tests that:
//   1. Same-origin WS upgrade with valid auth succeeds (HTTP 101).
//   2. Cross-origin WS upgrade with valid auth is REJECTED with real HTTP 403
//      and JSON body, before the auth gate is reached.

import { test } from "node:test";
import assert from "node:assert/strict";
import net from "node:net";
import path from "node:path";
import fs from "node:fs";
import { spawn } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { scryptSync, randomBytes } from "node:crypto";

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
  const tmpDir = mkdtempSync(path.join("/tmp", "httpath-origin-"));
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

function wsUpgrade(port, headers) {
  return new Promise((resolve) => {
    const sock = net.createConnection({ host: "127.0.0.1", port });
    let data = Buffer.alloc(0);
    const timeout = setTimeout(() => {
      sock.destroy();
      resolve(data.toString());
    }, 3000);
    sock.on("data", (chunk) => { data = Buffer.concat([data, chunk]); });
    sock.on("end", () => {
      clearTimeout(timeout);
      resolve(data.toString());
    });
    sock.on("error", () => {
      clearTimeout(timeout);
      resolve(data.toString());
    });
    const req = [
      "GET /livereload HTTP/1.1",
      `Host: 127.0.0.1:${port}`,
      "Upgrade: websocket",
      "Connection: Upgrade",
      "Sec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==",
      "Sec-WebSocket-Version: 13",
      ...headers,
      "",
      "",
    ].join("\r\n");
    sock.write(req);
  });
}

test("--lan: same-origin WS upgrade with valid auth succeeds (HTTP 101)", async () => {
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

      const authHeader = "Authorization: Basic " + Buffer.from("alice:secret").toString("base64");
      const data = await wsUpgrade(port, [
        authHeader,
        `Origin: http://127.0.0.1:${port}`,
      ]);

      assert.ok(
        data.includes("101"),
        "same-origin upgrade should get 101 Switching Protocols, got: " + data.slice(0, 200),
      );
      assert.ok(
        !data.includes("403"),
        "same-origin upgrade should NOT get 403, got: " + data.slice(0, 200),
      );
      assert.ok(
        !data.includes("401"),
        "same-origin upgrade should NOT get 401, got: " + data.slice(0, 200),
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

test("--lan: cross-origin WS upgrade is rejected with HTTP 403 + JSON body", async () => {
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

      const authHeader = "Authorization: Basic " + Buffer.from("alice:secret").toString("base64");
      const data = await wsUpgrade(port, [
        authHeader,
        "Origin: http://evil.com",
      ]);

      assert.ok(
        data.includes("HTTP/1.1 403"),
        "cross-origin upgrade should get HTTP 403, got: " + data.slice(0, 200),
      );
      assert.ok(
        data.includes("Forbidden"),
        "cross-origin upgrade should include 'Forbidden' reason phrase, got: " + data.slice(0, 200),
      );
      assert.ok(
        data.includes("Cross-origin"),
        "cross-origin upgrade should include JSON error body, got: " + data.slice(0, 200),
      );
      assert.ok(
        !data.includes("101"),
        "cross-origin upgrade should NOT get 101 Switching Protocols, got: " + data.slice(0, 200),
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
