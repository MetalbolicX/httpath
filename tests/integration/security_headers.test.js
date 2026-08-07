// tests/integration/security_headers.test.js — Integration test for security headers.
// Real Httpath.start round-trip with the Handler.make pipeline.
// Uses node:test per SDD spec (not rescript-test).
//
// Test coverage:
// - Static security headers on every HTTP response
// - CSP default-src 'none' on directory listing HTML
// - HSTS header on HTTPS responses when TLS is active
// - No HSTS header on plain HTTP responses

import { test, afterEach } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import https from "node:https";
import net from "node:net";
import path from "node:path";
import fs from "node:fs";
import { spawn } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from "node:fs";

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

function makeChildScript(port, tmpDir, extraConfig, tlsOptions) {
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
  ${tlsOptions ? `"--tls-cert", "${tlsOptions.cert}", "--tls-key", "${tlsOptions.key}"` : ""}
]);
if (parseResult.TAG !== "Ok") {
  console.error("CHILD: config parse failed", parseResult);
  process.exit(1);
}

const config = ${extraConfig ? `Object.assign({}, parseResult._0, ${extraConfig})` : "parseResult._0"};

// Wire real Handler.make instead of 501 stub.
const {handler, drain: draining} = makeHandler(config);

start(handler, draining, config, undefined);
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
      { hostname: "127.0.0.1", port, path: urlPath, method: options.method || "GET", headers: options.headers || {} },
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
// httpsGet — HTTPS wrapper returning { statusCode, headers, body }.
// ---------------------------------------------------------------------------

function httpsGet(port, urlPath, options = {}) {
  return new Promise((resolve, reject) => {
    const req = https.get(
      {
        hostname: "127.0.0.1",
        port,
        path: urlPath,
        method: options.method || "GET",
        headers: options.headers || {},
        rejectUnauthorized: false, // self-signed cert in test
      },
      (res) => {
        let data = "";
        res.on("data", (chunk) => (data += chunk));
        res.on("end", () => resolve({ statusCode: res.statusCode, headers: res.headers, body: data }));
      },
    );
    req.on("error", reject);
    req.setTimeout(2000, () => { req.destroy(); reject(new Error("HTTPS timeout")); });
  });
}

// ---------------------------------------------------------------------------
// Test: Every HTTP response carries the three static security headers.
// ---------------------------------------------------------------------------

test("GET /file.txt → response has x-content-type-options, x-frame-options, referrer-policy", async () => {
  const port = PORT_BASE + 1;
  const tmpDir = mkdtempSync(path.join("/tmp", "httpath-sec-"));
  writeFileSync(path.join(tmpDir, "file.txt"), "hello world");

  const { scriptPath } = makeChildScript(port, tmpDir, null);

  const child = spawn(process.execPath, [scriptPath], {
    stdio: ["ignore", "pipe", "pipe"],
    cwd: process.cwd(),
  });

  try {
    await new Promise((r) => setTimeout(r, 200));
    await waitForChildReady(child, port);

    const res = await httpGet(port, "/file.txt");

    assert.strictEqual(res.statusCode, 200, `Expected 200, got ${res.statusCode}`);
    assert.strictEqual(
      res.headers["x-content-type-options"],
      "nosniff",
      "x-content-type-options should be nosniff",
    );
    assert.strictEqual(
      res.headers["x-frame-options"],
      "DENY",
      "x-frame-options should be DENY",
    );
    assert.strictEqual(
      res.headers["referrer-policy"],
      "no-referrer",
      "referrer-policy should be no-referrer",
    );

    child.kill("SIGTERM");
    await new Promise((r) => child.on("exit", r));
  } finally {
    if (child.exitCode === null) child.kill("SIGTERM");
    rmSync(scriptPath, { force: true });
    rmSync(tmpDir, { recursive: true, force: true });
  }
});

// ---------------------------------------------------------------------------
// Test: Directory listing HTML carries CSP default-src 'none' (not broad CSP).
// ---------------------------------------------------------------------------

test("GET /subdir/ (directory listing) → CSP is default-src 'none'", async () => {
  const port = PORT_BASE + 2;
  const tmpDir = mkdtempSync(path.join("/tmp", "httpath-sec-"));
  const subDir = path.join(tmpDir, "subdir");
  mkdirSync(subDir);
  writeFileSync(path.join(subDir, "nested.txt"), "nested content");

  const { scriptPath } = makeChildScript(port, tmpDir, "{ enableDirectoryListing: true }");

  const child = spawn(process.execPath, [scriptPath], {
    stdio: ["ignore", "pipe", "pipe"],
    cwd: process.cwd(),
  });

  try {
    await new Promise((r) => setTimeout(r, 200));
    await waitForChildReady(child, port);

    const res = await httpGet(port, "/subdir/");

    assert.strictEqual(res.statusCode, 200, `Expected 200, got ${res.statusCode}`);
    assert.ok(
      res.headers["content-type"] && res.headers["content-type"].includes("text/html"),
      `Expected text/html, got ${res.headers["content-type"]}`,
    );
    const csp = res.headers["content-security-policy"];
    assert.ok(csp, "content-security-policy header must be present on directory listing");
    assert.ok(
      csp.startsWith("default-src 'none'"),
      `Directory listing CSP should be default-src 'none', got: ${csp}`,
    );
    // Must NOT be the broad CSP
    assert.ok(
      !csp.includes("script-src 'unsafe-inline'"),
      `Directory listing CSP should NOT contain broad CSP unsafe-inline, got: ${csp}`,
    );

    child.kill("SIGTERM");
    await new Promise((r) => child.on("exit", r));
  } finally {
    if (child.exitCode === null) child.kill("SIGTERM");
    rmSync(scriptPath, { force: true });
    rmSync(tmpDir, { recursive: true, force: true });
  }
});

// ---------------------------------------------------------------------------
// Test: Plain file download does NOT get default-src 'none' CSP.
// ---------------------------------------------------------------------------

test("GET /file.txt → CSP is the broad default-src 'self' (not 'none')", async () => {
  const port = PORT_BASE + 3;
  const tmpDir = mkdtempSync(path.join("/tmp", "httpath-sec-"));
  writeFileSync(path.join(tmpDir, "file.txt"), "hello world");

  const { scriptPath } = makeChildScript(port, tmpDir, null);

  const child = spawn(process.execPath, [scriptPath], {
    stdio: ["ignore", "pipe", "pipe"],
    cwd: process.cwd(),
  });

  try {
    await new Promise((r) => setTimeout(r, 200));
    await waitForChildReady(child, port);

    const res = await httpGet(port, "/file.txt");

    assert.strictEqual(res.statusCode, 200, `Expected 200, got ${res.statusCode}`);
    const csp = res.headers["content-security-policy"];
    assert.ok(csp, "content-security-policy header must be present");
    assert.ok(
      csp.includes("default-src 'self'"),
      `Plain file CSP should contain default-src 'self', got: ${csp}`,
    );
    assert.ok(
      !csp.startsWith("default-src 'none'"),
      `Plain file CSP should NOT be default-src 'none', got: ${csp}`,
    );

    child.kill("SIGTERM");
    await new Promise((r) => child.on("exit", r));
  } finally {
    if (child.exitCode === null) child.kill("SIGTERM");
    rmSync(scriptPath, { force: true });
    rmSync(tmpDir, { recursive: true, force: true });
  }
});

// ---------------------------------------------------------------------------
// Test: No HSTS on plain HTTP (tls=false).
// ---------------------------------------------------------------------------

test("GET /file.txt over HTTP (no TLS) → no strict-transport-security header", async () => {
  const port = PORT_BASE + 4;
  const tmpDir = mkdtempSync(path.join("/tmp", "httpath-sec-"));
  writeFileSync(path.join(tmpDir, "file.txt"), "hello world");

  const { scriptPath } = makeChildScript(port, tmpDir, null);

  const child = spawn(process.execPath, [scriptPath], {
    stdio: ["ignore", "pipe", "pipe"],
    cwd: process.cwd(),
  });

  try {
    await new Promise((r) => setTimeout(r, 200));
    await waitForChildReady(child, port);

    const res = await httpGet(port, "/file.txt");

    assert.strictEqual(res.statusCode, 200, `Expected 200, got ${res.statusCode}`);
    assert.ok(
      !res.headers["strict-transport-security"],
      "HTTP response should NOT have strict-transport-security header",
    );

    child.kill("SIGTERM");
    await new Promise((r) => child.on("exit", r));
  } finally {
    if (child.exitCode === null) child.kill("SIGTERM");
    rmSync(scriptPath, { force: true });
    rmSync(tmpDir, { recursive: true, force: true });
  }
});

// ---------------------------------------------------------------------------
// Test: HSTS header present on HTTPS response when TLS is active.
// ---------------------------------------------------------------------------

test("GET /file.txt over HTTPS (TLS active) → strict-transport-security header present", async () => {
  const port = PORT_BASE + 5;
  const tmpDir = mkdtempSync(path.join("/tmp", "httpath-sec-"));
  writeFileSync(path.join(tmpDir, "file.txt"), "hello world");

  // Generate self-signed cert for HTTPS test using openssl
  const certFile = path.join(tmpDir, "cert.pem");
  const keyFile = path.join(tmpDir, "key.pem");

  await new Promise((resolve, reject) => {
    const openssl = spawn("openssl", [
      "req", "-x509", "-newkey", "rsa:2048",
      "-keyout", keyFile, "-out", certFile,
      "-days", "1", "-nodes",
      "-subj", "/CN=localhost",
    ], { cwd: tmpDir, stdio: ["ignore", "pipe", "pipe"] });
    let stderr = "";
    openssl.stderr.on("data", (d) => (stderr += d.toString()));
    openssl.on("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`openssl failed with code ${code}: ${stderr}`));
    });
  });

  const tlsOptions = { cert: certFile, key: keyFile };
  const { scriptPath } = makeChildScript(port, tmpDir, null, tlsOptions);

  const child = spawn(process.execPath, [scriptPath], {
    stdio: ["ignore", "pipe", "pipe"],
    cwd: process.cwd(),
  });

  try {
    await new Promise((r) => setTimeout(r, 200));
    await waitForChildReady(child, port);

    const res = await httpsGet(port, "/file.txt");

    assert.strictEqual(res.statusCode, 200, `Expected 200, got ${res.statusCode}`);
    assert.ok(
      res.headers["strict-transport-security"],
      "HTTPS response MUST have strict-transport-security header when TLS is active",
    );
    assert.ok(
      res.headers["strict-transport-security"].includes("max-age=31536000"),
      `HSTS max-age should be 31536000, got: ${res.headers["strict-transport-security"]}`,
    );
    assert.ok(
      res.headers["strict-transport-security"].includes("includeSubDomains"),
      `HSTS should include includeSubDomains directive, got: ${res.headers["strict-transport-security"]}`,
    );

    child.kill("SIGTERM");
    await new Promise((r) => child.on("exit", r));
  } finally {
    if (child.exitCode === null) child.kill("SIGTERM");
    rmSync(scriptPath, { force: true });
    rmSync(tmpDir, { recursive: true, force: true });
  }
});
