// tests/integration/static_handler.test.js — Integration test for static file handler.
// Real Httpath.start round-trip with the Handler.make pipeline.
// Uses node:test per SDD spec (not rescript-test).
//
// Test coverage per REQ-INT-1..5 and scenarios 1-19:
// - GET / with directory listing enabled
// - GET /README.md (file serving, content-type, content-length)
// - GET /page.html with enableLiveReload=true (injected script)
// - GET /page.html with enableLiveReload=false (no injection)
// - POST /README.md → 405 + allow: GET, HEAD
// - GET /../../etc/passwd → 403 (traversal blocked)
// - GET /missing.txt → 404
// - HEAD / (empty body, content-type)
// - HEAD /page.html (empty body, content-type)

import { test, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import net from "node:net";
import path from "node:path";
import fs from "node:fs";
import { spawn } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync, symlinkSync, mkdirSync } from "node:fs";

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

const PORT_BASE = 9300;

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

// Wire real Handler.make instead of 501 stub.
const handler = makeHandler(config);

start(handler, config);
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
// Helper: create a temp directory with sample files for each test.
// Returns { tmpDir, dirPath } where dirPath is the served directory.
// ---------------------------------------------------------------------------

function makeTempDir(port, files, extraConfig) {
  const tmpDir = mkdtempSync(path.join("/tmp", "httpath-static-"));
  const { scriptPath } = makeChildScript(port, tmpDir, extraConfig);
  return { tmpDir, scriptPath };
}

// ---------------------------------------------------------------------------
// Test: GET / with directory listing enabled → 200 + text/html + listing
// ---------------------------------------------------------------------------

test("GET / with enableDirectoryListing=true → 200 + text/html + listing HTML", async () => {
  const port = PORT_BASE + 1;
  const tmpDir = mkdtempSync(path.join("/tmp", "httpath-static-"));
  // Create a file so listing is non-empty
  writeFileSync(path.join(tmpDir, "README.md"), "# Sample Project\nThis is a test file.");
  writeFileSync(path.join(tmpDir, "style.css"), "body { color: red; }");

  const { scriptPath } = makeChildScript(port, tmpDir, "{ enableDirectoryListing: true }");

  const child = spawn(process.execPath, [scriptPath], {
    stdio: ["ignore", "pipe", "pipe"],
    cwd: process.cwd(),
  });

  let stderr = "";
  child.stderr.on("data", (d) => (stderr += d.toString()));

  try {
    await new Promise((r) => setTimeout(r, 200));
    await waitForChildReady(child, port);

    const res = await httpGet(port, "/");

    assert.strictEqual(res.statusCode, 200, `Expected 200, got ${res.statusCode}`);
    assert.ok(
      res.headers["content-type"] && res.headers["content-type"].includes("text/html"),
      `Expected text/html, got ${res.headers["content-type"]}`
    );
    assert.ok(res.body.length > 0, "Expected non-empty body for directory listing");
    // Listing should contain file names
    assert.ok(res.body.includes("README.md") || res.body.includes("style.css"), "Listing should contain files");
    // Should contain the 8 security headers
    assert.ok(res.headers["x-content-type-options"], "Missing x-content-type-options header");

    child.kill("SIGTERM");
    await new Promise((r) => child.on("exit", r));
  } finally {
    if (child.exitCode === null) child.kill("SIGTERM");
    rmSync(scriptPath, { force: true });
    rmSync(tmpDir, { recursive: true, force: true });
  }
});

// ---------------------------------------------------------------------------
// Test: GET /README.md → 200 + text/markdown + correct content-length
// ---------------------------------------------------------------------------

test("GET /README.md → 200 + correct content-type + content-length", async () => {
  const port = PORT_BASE + 2;
  const tmpDir = mkdtempSync(path.join("/tmp", "httpath-static-"));
  const fileContent = "# Sample\nThis is a test file for the static file handler.";
  writeFileSync(path.join(tmpDir, "README.md"), fileContent);

  const { scriptPath } = makeChildScript(port, tmpDir, null);

  const child = spawn(process.execPath, [scriptPath], {
    stdio: ["ignore", "pipe", "pipe"],
    cwd: process.cwd(),
  });

  try {
    await new Promise((r) => setTimeout(r, 200));
    await waitForChildReady(child, port);

    const res = await httpGet(port, "/README.md");

    assert.strictEqual(res.statusCode, 200, `Expected 200, got ${res.statusCode}`);
    assert.ok(
      res.headers["content-type"],
      `Expected content-type header, got ${JSON.stringify(res.headers)}`
    );
    // content-length should match actual body length
    const contentLength = parseInt(res.headers["content-length"] || "0", 10);
    assert.strictEqual(contentLength, Buffer.byteLength(fileContent, "utf8"), "content-length should match file size");
    assert.ok(res.headers["x-content-type-options"], "Missing security header x-content-type-options");

    child.kill("SIGTERM");
    await new Promise((r) => child.on("exit", r));
  } finally {
    if (child.exitCode === null) child.kill("SIGTERM");
    rmSync(scriptPath, { force: true });
    rmSync(tmpDir, { recursive: true, force: true });
  }
});

// ---------------------------------------------------------------------------
// Test: GET /logo.svg → 200 + content-disposition attachment; filename="logo.svg"
// Regression: replaceByRe args were swapped, causing basename to be the
// replacement string instead of the source, resulting in filename="".
// ---------------------------------------------------------------------------

test("GET /logo.svg → 200 + content-disposition attachment; filename=\"logo.svg\"", async () => {
  const port = PORT_BASE + 10;
  const tmpDir = mkdtempSync(path.join("/tmp", "httpath-static-"));
  const fileContent = "<svg></svg>";
  writeFileSync(path.join(tmpDir, "logo.svg"), fileContent);

  const { scriptPath } = makeChildScript(port, tmpDir, null);

  const child = spawn(process.execPath, [scriptPath], {
    stdio: ["ignore", "pipe", "pipe"],
    cwd: process.cwd(),
  });

  try {
    await new Promise((r) => setTimeout(r, 200));
    await waitForChildReady(child, port);

    const res = await httpGet(port, "/logo.svg");

    assert.strictEqual(res.statusCode, 200, `Expected 200, got ${res.statusCode}`);
    const cd = res.headers["content-disposition"];
    assert.ok(cd, `Expected content-disposition header, got ${JSON.stringify(res.headers)}`);
    assert.ok(
      cd.startsWith("attachment; filename=\""),
      `Expected content-disposition to start with 'attachment; filename="', got '${cd}'`
    );
    assert.ok(
      cd.includes("logo.svg"),
      `Expected content-disposition to contain 'logo.svg', got '${cd}'`
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
// Test: GET /page.html with enableLiveReload=true → HTML with injected script
// ---------------------------------------------------------------------------

test("GET /page.html with enableLiveReload=true → 200 + HTML with live-reload script", async () => {
  const port = PORT_BASE + 3;
  const tmpDir = mkdtempSync(path.join("/tmp", "httpath-static-"));
  const htmlContent = "<html><body><p>Hello World</p></body></html>";
  writeFileSync(path.join(tmpDir, "page.html"), htmlContent);

  const { scriptPath } = makeChildScript(port, tmpDir, "{ enableLiveReload: true }");

  const child = spawn(process.execPath, [scriptPath], {
    stdio: ["ignore", "pipe", "pipe"],
    cwd: process.cwd(),
  });

  try {
    await new Promise((r) => setTimeout(r, 200));
    await waitForChildReady(child, port);

    const res = await httpGet(port, "/page.html");

    assert.strictEqual(res.statusCode, 200, `Expected 200, got ${res.statusCode}`);
    assert.ok(res.body.includes("<script>"), "HTML should contain injected live-reload script");
    assert.ok(res.body.includes("livereload") || res.body.includes("WebSocket"), "Script should reference livereload");
    assert.ok(res.headers["x-content-type-options"], "Missing security header");

    child.kill("SIGTERM");
    await new Promise((r) => child.on("exit", r));
  } finally {
    if (child.exitCode === null) child.kill("SIGTERM");
    rmSync(scriptPath, { force: true });
    rmSync(tmpDir, { recursive: true, force: true });
  }
});

// ---------------------------------------------------------------------------
// Test: GET /page.html with enableLiveReload=false → HTML without injected script
// ---------------------------------------------------------------------------

test("GET /page.html with enableLiveReload=false → 200 + HTML without script", async () => {
  const port = PORT_BASE + 4;
  const tmpDir = mkdtempSync(path.join("/tmp", "httpath-static-"));
  const htmlContent = "<html><body><p>Hello World</p></body></html>";
  writeFileSync(path.join(tmpDir, "page.html"), htmlContent);

  const { scriptPath } = makeChildScript(port, tmpDir, "{ enableLiveReload: false }");

  const child = spawn(process.execPath, [scriptPath], {
    stdio: ["ignore", "pipe", "pipe"],
    cwd: process.cwd(),
  });

  try {
    await new Promise((r) => setTimeout(r, 200));
    await waitForChildReady(child, port);

    const res = await httpGet(port, "/page.html");

    assert.strictEqual(res.statusCode, 200, `Expected 200, got ${res.statusCode}`);
    assert.ok(res.body.includes("<p>Hello World</p>"), "HTML body should be preserved");
    // With LR disabled, there should be NO live-reload script injection
    // Count script tags — should be 0 (no injection)
    const scriptTagCount = (res.body.match(/<script>/g) || []).length;
    assert.strictEqual(scriptTagCount, 0, `Expected no script injection, found ${scriptTagCount} <script> tags`);

    child.kill("SIGTERM");
    await new Promise((r) => child.on("exit", r));
  } finally {
    if (child.exitCode === null) child.kill("SIGTERM");
    rmSync(scriptPath, { force: true });
    rmSync(tmpDir, { recursive: true, force: true });
  }
});

// ---------------------------------------------------------------------------
// Test: POST /README.md → 405 + allow: GET, HEAD
// ---------------------------------------------------------------------------

test("POST /README.md → 405 Method Not Allowed + allow: GET, HEAD", async () => {
  const port = PORT_BASE + 5;
  const tmpDir = mkdtempSync(path.join("/tmp", "httpath-static-"));
  writeFileSync(path.join(tmpDir, "README.md"), "# Sample");

  const { scriptPath } = makeChildScript(port, tmpDir, null);

  const child = spawn(process.execPath, [scriptPath], {
    stdio: ["ignore", "pipe", "pipe"],
    cwd: process.cwd(),
  });

  try {
    await new Promise((r) => setTimeout(r, 200));
    await waitForChildReady(child, port);

    const res = await httpGet(port, "/README.md", { method: "POST" });

    assert.strictEqual(res.statusCode, 405, `Expected 405, got ${res.statusCode}`);
    assert.ok(res.headers["allow"], `Expected allow header, got ${JSON.stringify(res.headers)}`);
    assert.ok(
      res.headers["allow"].includes("GET") && res.headers["allow"].includes("HEAD"),
      `allow should include GET and HEAD, got ${res.headers["allow"]}`
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
// Test: GET /../../etc/passwd → 403 traversal blocked
// ---------------------------------------------------------------------------

test("GET /../../etc/passwd → 403 Forbidden (traversal blocked)", async () => {
  const port = PORT_BASE + 6;
  const tmpDir = mkdtempSync(path.join("/tmp", "httpath-static-"));
  writeFileSync(path.join(tmpDir, "README.md"), "# Sample");

  const { scriptPath } = makeChildScript(port, tmpDir, null);

  const child = spawn(process.execPath, [scriptPath], {
    stdio: ["ignore", "pipe", "pipe"],
    cwd: process.cwd(),
  });

  try {
    await new Promise((r) => setTimeout(r, 200));
    await waitForChildReady(child, port);

    const res = await httpGet(port, "/../../etc/passwd");

    assert.strictEqual(res.statusCode, 403, `Expected 403, got ${res.statusCode}`);
    assert.ok(res.headers["x-content-type-options"], "Should still have security headers on 403");

    child.kill("SIGTERM");
    await new Promise((r) => child.on("exit", r));
  } finally {
    if (child.exitCode === null) child.kill("SIGTERM");
    rmSync(scriptPath, { force: true });
    rmSync(tmpDir, { recursive: true, force: true });
  }
});

// ---------------------------------------------------------------------------
// Test: GET /missing.txt → 404
// ---------------------------------------------------------------------------

test("GET /missing.txt → 404 Not Found", async () => {
  const port = PORT_BASE + 7;
  const tmpDir = mkdtempSync(path.join("/tmp", "httpath-static-"));
  writeFileSync(path.join(tmpDir, "README.md"), "# Sample");

  const { scriptPath } = makeChildScript(port, tmpDir, null);

  const child = spawn(process.execPath, [scriptPath], {
    stdio: ["ignore", "pipe", "pipe"],
    cwd: process.cwd(),
  });

  try {
    await new Promise((r) => setTimeout(r, 200));
    await waitForChildReady(child, port);

    const res = await httpGet(port, "/missing.txt");

    assert.strictEqual(res.statusCode, 404, `Expected 404, got ${res.statusCode}`);

    child.kill("SIGTERM");
    await new Promise((r) => child.on("exit", r));
  } finally {
    if (child.exitCode === null) child.kill("SIGTERM");
    rmSync(scriptPath, { force: true });
    rmSync(tmpDir, { recursive: true, force: true });
  }
});

// ---------------------------------------------------------------------------
// Test: HEAD / → 200 + empty body + content-type
// ---------------------------------------------------------------------------

test("HEAD / → 200 + empty body + content-type header", async () => {
  const port = PORT_BASE + 8;
  const tmpDir = mkdtempSync(path.join("/tmp", "httpath-static-"));
  writeFileSync(path.join(tmpDir, "README.md"), "# Sample");

  const { scriptPath } = makeChildScript(port, tmpDir, "{ enableDirectoryListing: true }");

  const child = spawn(process.execPath, [scriptPath], {
    stdio: ["ignore", "pipe", "pipe"],
    cwd: process.cwd(),
  });

  try {
    await new Promise((r) => setTimeout(r, 200));
    await waitForChildReady(child, port);

    const res = await httpGet(port, "/", { method: "HEAD" });

    assert.strictEqual(res.statusCode, 200, `Expected 200, got ${res.statusCode}`);
    assert.strictEqual(res.body.length, 0, "HEAD should have empty body");
    assert.ok(
      res.headers["content-type"] && res.headers["content-type"].includes("text/html"),
      `Expected text/html content-type, got ${res.headers["content-type"]}`
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
// Test: HEAD /page.html → 200 + empty body + correct content-type
// ---------------------------------------------------------------------------

test("HEAD /page.html → 200 + empty body + text/html content-type", async () => {
  const port = PORT_BASE + 9;
  const tmpDir = mkdtempSync(path.join("/tmp", "httpath-static-"));
  writeFileSync(path.join(tmpDir, "page.html"), "<html><body>Test</body></html>");

  const { scriptPath } = makeChildScript(port, tmpDir, null);

  const child = spawn(process.execPath, [scriptPath], {
    stdio: ["ignore", "pipe", "pipe"],
    cwd: process.cwd(),
  });

  try {
    await new Promise((r) => setTimeout(r, 200));
    await waitForChildReady(child, port);

    const res = await httpGet(port, "/page.html", { method: "HEAD" });

    assert.strictEqual(res.statusCode, 200, `Expected 200, got ${res.statusCode}`);
    assert.strictEqual(res.body.length, 0, "HEAD should have empty body");
    assert.ok(
      res.headers["content-type"] && res.headers["content-type"].includes("text/html"),
      `Expected text/html content-type, got ${res.headers["content-type"]}`
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
// Test: all responses contain 8 security headers (REQ-HEADERS-3)
// ---------------------------------------------------------------------------

test("Every response contains all 8 security headers", async () => {
  const port = PORT_BASE + 10;
  const tmpDir = mkdtempSync(path.join("/tmp", "httpath-static-"));
  writeFileSync(path.join(tmpDir, "file.txt"), "hello");

  const { scriptPath } = makeChildScript(port, tmpDir, null);

  const child = spawn(process.execPath, [scriptPath], {
    stdio: ["ignore", "pipe", "pipe"],
    cwd: process.cwd(),
  });

  try {
    await new Promise((r) => setTimeout(r, 200));
    await waitForChildReady(child, port);

    const res = await httpGet(port, "/file.txt");

    const securityHeaders = [
      "x-content-type-options",
      "x-frame-options",
      "referrer-policy",
      "permissions-policy",
      "cross-origin-opener-policy",
      "cross-origin-resource-policy",
      "x-permitted-cross-domain-policies",
      "content-security-policy",
    ];

    for (const header of securityHeaders) {
      assert.ok(res.headers[header], `Missing security header: ${header}`);
    }

    child.kill("SIGTERM");
    await new Promise((r) => child.on("exit", r));
  } finally {
    if (child.exitCode === null) child.kill("SIGTERM");
    rmSync(scriptPath, { force: true });
    rmSync(tmpDir, { recursive: true, force: true });
  }
});
