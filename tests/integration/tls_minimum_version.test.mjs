// tests/integration/tls_minimum_version.test.mjs — Integration test for TLS 1.2 minimum enforcement.
// Tests that TLS 1.0 and TLS 1.1 handshakes are rejected by the HTTPS server.
// Uses node:test, spawns a real server process.

import { test } from "node:test";
import assert from "node:assert/strict";
import net from "node:net";
import path from "node:path";
import fs from "node:fs";
import { spawn, spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import tls from "node:tls";

// ---------------------------------------------------------------------------
// Global fs shim (same pattern as lan_tls.test.mjs)
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

const PORT_BASE = 19500;

// ---------------------------------------------------------------------------
// makeChildScript — writes a child-process script that starts Httpath.start
// with Handler.make(config) wiring.
// ---------------------------------------------------------------------------

function makeChildScript(port, tmpDir, extraConfig) {
  const scriptPath = path.join(tmpDir, "child.mjs");
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

const config = ${extraConfig ? `Object.assign({}, parseResult._0, ${extraConfig})` : "parseResult._0"};

const {handler, drain: draining} = makeHandler(config);
start(handler, draining, config, undefined);
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
// collectOutput — capture stdout/stderr from child process.
// ---------------------------------------------------------------------------

function collectOutput(child) {
  let out = "";
  child.stdout.on("data", (d) => { out += d; });
  child.stderr.on("data", (d) => { out += d; });
  return () => out;
}

// ---------------------------------------------------------------------------
// Test: TLS 1.0 and TLS 1.1 are rejected by the HTTPS server
// ---------------------------------------------------------------------------

test("TLS 1.0 and TLS 1.1 are rejected by the HTTPS server", async () => {
  const port = PORT_BASE + 30;
  const tmpDir = mkdtempSync(path.join("/tmp", "httpath-tls-min-"));

  // Generate self-signed RSA cert (same pattern as lan_tls.test.mjs)
  const certPath = path.join(tmpDir, "cert.pem");
  const keyPath = path.join(tmpDir, "key.pem");
  const r = spawnSync("openssl", [
    "req", "-x509", "-newkey", "rsa:2048", "-nodes",
    "-keyout", keyPath, "-out", certPath,
    "-days", "1", "-subj", "/CN=httpath-test",
  ]);
  if (r.status !== 0) {
    rmSync(tmpDir, { recursive: true, force: true });
    throw new Error("openssl failed: " + (r.stderr?.toString() ?? "unknown error"));
  }

  const { scriptPath } = makeChildScript(port, tmpDir, JSON.stringify({
    tls: true,
    tlsCert: certPath,
    tlsKey: keyPath,
  }));

  const child = spawn(process.execPath, [scriptPath], {
    stdio: ["ignore", "pipe", "pipe"],
    cwd: process.cwd(),
  });

  try {
    await waitForChildReady(child, port, 5000);

    // Attempt TLS 1.0 connection — should be REJECTED.
    const tlsResult0 = await new Promise((resolve) => {
      const netConn = net.createConnection({ host: "127.0.0.1", port });
      const tlsConn = tls.connect({
        host: "127.0.0.1",
        port,
        minVersion: "TLSv1",
        maxVersion: "TLSv1",
        rejectUnauthorized: false,
      }, () => {
        // If we reach here, handshake succeeded — reject.
        tlsConn.destroy();
        netConn.destroy();
        resolve({ rejected: false });
      });
      tlsConn.on("error", (err) => {
        netConn.destroy();
        resolve({ rejected: true, error: err.message });
      });
      tlsConn.on("timeout", () => {
        tlsConn.destroy();
        netConn.destroy();
        resolve({ rejected: true, error: "timeout" });
      });
    });
    assert.strictEqual(tlsResult0.rejected, true,
      "TLS 1.0 should be rejected; got: " + (tlsResult0.error ?? "no error"));

    // Attempt TLS 1.1 connection — should be REJECTED.
    const tlsResult1 = await new Promise((resolve) => {
      const netConn = net.createConnection({ host: "127.0.0.1", port });
      const tlsConn = tls.connect({
        host: "127.0.0.1",
        port,
        minVersion: "TLSv1.1",
        maxVersion: "TLSv1.1",
        rejectUnauthorized: false,
      }, () => {
        tlsConn.destroy();
        netConn.destroy();
        resolve({ rejected: false });
      });
      tlsConn.on("error", (err) => {
        netConn.destroy();
        resolve({ rejected: true, error: err.message });
      });
      tlsConn.on("timeout", () => {
        tlsConn.destroy();
        netConn.destroy();
        resolve({ rejected: true, error: "timeout" });
      });
    });
    assert.strictEqual(tlsResult1.rejected, true,
      "TLS 1.1 should be rejected; got: " + (tlsResult1.error ?? "no error"));

    child.kill("SIGTERM");
    await new Promise((r) => child.on("exit", r));
  } finally {
    if (child.exitCode === null) child.kill("SIGTERM");
    rmSync(scriptPath, { force: true });
    rmSync(tmpDir, { recursive: true, force: true });
  }
});
