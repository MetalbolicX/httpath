// tests/integration/health_probes.test.mjs — Health and readiness probe integration test.
// Verifies /healthz returns 200 always, /readyz returns 200 or 503 based on draining state.

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

const PORT_BASE = 19800;

function makeChildScript(port, tmpDir) {
  const scriptPath = path.join(tmpDir, "child-probes.mjs");
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
  console.error("CHILD: config parse failed", parseResult);
  process.exit(1);
}

const config = parseResult._0;
const {handler, drain: draining} = makeHandler(config);
start(handler, draining, config, null);
`;
  writeFileSync(scriptPath, childScript);
  return { scriptPath };
}

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

function httpGet(port, path) {
  return new Promise((resolve, reject) => {
    const sock = net.createConnection({ host: "127.0.0.1", port }, () => {
      sock.write(`GET ${path} HTTP/1.1\r\nHost: localhost\r\nConnection: close\r\n\r\n`);
    });
    let buf = "";
    sock.on("data", (d) => (buf += d.toString()));
    sock.on("end", () => resolve(buf));
    sock.on("error", reject);
    sock.setTimeout(2000, () => reject(new Error("Request timed out")));
  });
}

// ---------------------------------------------------------------------------
// Test 1: /healthz returns 200 with {"status":"ok"}
// ---------------------------------------------------------------------------

test("probe: /healthz returns 200 with ok status", async () => {
  const tmpDir = mkdtempSync(path.join("/tmp", "httpath-probes-"));
  writeFileSync(path.join(tmpDir, "index.html"), "<h1>test</h1>", "utf8");

  const port = PORT_BASE + 1;
  const { scriptPath } = makeChildScript(port, tmpDir);

  const child = spawn(process.execPath, [scriptPath], {
    stdio: ["ignore", "pipe", "pipe"],
    cwd: process.cwd(),
    env: { ...process.env },
  });

  try {
    await new Promise((r) => setTimeout(r, 400));
    await waitForChildReady(child, port, 5000);

    const response = await httpGet(port, "/healthz");

    assert.match(response, /HTTP\/1\.[01] 200/, `Expected 200, got: ${response.slice(0, 200)}`);
    assert.match(response, /{"status":"ok"}/, `Expected {"status":"ok"} in body, got: ${response}`);

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
// Test 2: /readyz returns 200 with {"status":"ready"} when not draining
// ---------------------------------------------------------------------------

test("probe: /readyz returns 200 with ready status when not draining", async () => {
  const tmpDir = mkdtempSync(path.join("/tmp", "httpath-probes-"));
  writeFileSync(path.join(tmpDir, "index.html"), "<h1>test</h1>", "utf8");

  const port = PORT_BASE + 2;
  const { scriptPath } = makeChildScript(port, tmpDir);

  const child = spawn(process.execPath, [scriptPath], {
    stdio: ["ignore", "pipe", "pipe"],
    cwd: process.cwd(),
    env: { ...process.env },
  });

  try {
    await new Promise((r) => setTimeout(r, 400));
    await waitForChildReady(child, port, 5000);

    const response = await httpGet(port, "/readyz");

    assert.match(response, /HTTP\/1\.[01] 200/, `Expected 200, got: ${response.slice(0, 200)}`);
    assert.match(response, /{"status":"ready"}/, `Expected {"status":"ready"} in body, got: ${response}`);

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
