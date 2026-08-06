// tests/integration/logging_json.test.mjs — Integration tests for structured JSON logging.
// Validates that Logger emits valid JSON in Json mode, legacy format in Plain mode,
// and AccessLog.formatJson produces the required JSON field set.
// T-SL-001: RED coverage for structured-correlated-logging slice 1.

import { test } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import path from "node:path";
import fs from "node:fs";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

// ---------------------------------------------------------------------------
// Imports — compiled ReScript modules
// ---------------------------------------------------------------------------

const Logger = await import("../../src/Utils/Logger.res.mjs");
const AccessLog = await import("../../src/Server/AccessLog.res.mjs");

// ---------------------------------------------------------------------------
// Project root
// ---------------------------------------------------------------------------

const PROJECT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

// ---------------------------------------------------------------------------
// Helper: build child script content with absolute paths resolved in parent
// ---------------------------------------------------------------------------

function makeChildScript(getBody) {
  const loggerPath = path.resolve(PROJECT_ROOT, "src/Utils/Logger.res.mjs");
  // Escape backslashes for Windows compatibility in the JS string literal
  const escapedRoot = PROJECT_ROOT.replace(/\\/g, "\\\\");
  const escapedLoggerPath = loggerPath.replace(/\\/g, "\\\\");
  const body = getBody(escapedRoot, escapedLoggerPath);
  return body;
}

// ---------------------------------------------------------------------------
// Helper: run child script and capture output
// ---------------------------------------------------------------------------

function runChildScript(scriptContent, timeoutMs = 8000) {
  const tmpDir = mkdtempSync(path.join("/tmp", "httpath-logging-json-"));
  const scriptPath = path.join(tmpDir, "logging-test.mjs");
  writeFileSync(scriptPath, scriptContent, "utf8");

  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [scriptPath], {
      stdio: ["ignore", "pipe", "pipe"],
      cwd: PROJECT_ROOT,
      env: { ...process.env },
    });

    let stdoutData = "";
    let stderrData = "";

    child.stdout.on("data", (d) => (stdoutData += d.toString()));
    child.stderr.on("data", (d) => (stderrData += d.toString()));

    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      reject(new Error("Child script timed out after " + timeoutMs + "ms"));
    }, timeoutMs);

    child.on("exit", (code) => {
      clearTimeout(timer);
      resolve({ code, stdoutData, stderrData, tmpDir, scriptPath });
    });
    child.on("error", (err) => {
      clearTimeout(timer);
      reject(err);
    });
  });
}

// ---------------------------------------------------------------------------
// Helper: parse a single JSON line (strips trailing newline)
// ---------------------------------------------------------------------------

function parseJsonLine(line) {
  const trimmed = line.trim();
  if (!trimmed) return null;
  try {
    return JSON.parse(trimmed);
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// T-SL-001.a: Logger.setMode("Json") + Logger.log → valid JSON line
// ---------------------------------------------------------------------------

test("Logger: setMode(Json) then log emits valid JSON with ts, level, msg", async () => {
  const script = makeChildScript((root, loggerPath) =>
    `import fs from "node:fs";\n` +
    `globalThis.fs = fs;\n` +
    `globalThis.createReadStream = fs.createReadStream.bind(fs);\n` +
    `const PROJECT_ROOT = "${root}";\n` +
    `const loggerUrl = "file://${loggerPath}";\n` +
    `const Logger = await import(loggerUrl);\n` +
    `Logger.setMode("Json");\n` +
    `Logger.log("Info", "hello world");\n`
  );

  let result;
  try {
    result = await runChildScript(script);
  } catch (e) {
    throw new Error(`Child script failed to run: ${e.message}`);
  }

  const { stdoutData, tmpDir, scriptPath } = result;
  try {
    const lines = stdoutData.split("\n").filter((l) => l.trim().length > 0);
    assert.ok(
      lines.length >= 1,
      `Expected at least 1 stdout line, got ${lines.length}. stdout: ${JSON.stringify(lines.slice(0, 3))}`
    );

    const parsed = parseJsonLine(lines[0]);
    assert.ok(
      parsed !== null,
      `stdout line is not valid JSON: ${lines[0]}`
    );
    assert.ok(
      parsed.ts !== undefined && typeof parsed.ts === "string",
      `JSON missing or non-string 'ts': ${JSON.stringify(parsed)}`
    );
    assert.ok(
      parsed.level !== undefined && parsed.level === "info",
      `JSON missing or wrong 'level': ${JSON.stringify(parsed)}`
    );
    assert.ok(
      parsed.msg !== undefined && parsed.msg === "hello world",
      `JSON missing or wrong 'msg': ${JSON.stringify(parsed)}`
    );
  } finally {
    rmSync(scriptPath, { force: true });
    rmSync(tmpDir, { recursive: true, force: true });
  }
});

// ---------------------------------------------------------------------------
// T-SL-001.b: Logger.setMode("Plain") → legacy plain-text format
// ---------------------------------------------------------------------------

test("Logger: setMode(Plain) then log emits plain text (not JSON)", async () => {
  const script = makeChildScript((root, lp) =>
    `import fs from "node:fs";\n` +
    `globalThis.fs = fs;\n` +
    `globalThis.createReadStream = fs.createReadStream.bind(fs);\n` +
    `const loggerUrl = "file://${lp}";\n` +
    `const Logger = await import(loggerUrl);\n` +
    `Logger.setMode("Plain");\n` +
    `Logger.log("Info", "plain message");\n`
  );

  let result;
  try {
    result = await runChildScript(script);
  } catch (e) {
    throw new Error(`Child script failed to run: ${e.message}`);
  }

  const { stdoutData, tmpDir, scriptPath } = result;
  try {
    const lines = stdoutData.split("\n").filter((l) => l.trim().length > 0);
    assert.ok(
      lines.length >= 1,
      `Expected at least 1 stdout line, got: ${JSON.stringify(lines.slice(0, 3))}`
    );
    // Plain mode should NOT be valid JSON
    const parsed = parseJsonLine(lines[0]);
    assert.ok(
      parsed === null || parsed.ts === undefined,
      `Plain mode emitted JSON instead of text: ${lines[0]}`
    );
    // Should contain the message
    assert.ok(
      lines[0].includes("plain message"),
      `Plain output does not contain message: ${lines[0]}`
    );
  } finally {
    rmSync(scriptPath, { force: true });
    rmSync(tmpDir, { recursive: true, force: true });
  }
});

// ---------------------------------------------------------------------------
// T-SL-001.c: AccessLog.formatJson produces required fields
// ---------------------------------------------------------------------------

test("AccessLog.formatJson: emits JSON with ts, request_id, ip, method, path, status, bytes, duration_ms", () => {
  const entry = {
    timestamp: "2026-08-06T12:34:56.789Z",
    requestId: "test-uuid-1234",
    ip: "192.168.1.100",
    method: "GET",
    path: "/index.html",
    status: 200,
    bytes: 1024,
    duration_ms: 42,
  };

  const line = AccessLog.formatJson(entry);
  const parsed = parseJsonLine(line);

  assert.ok(parsed !== null, `formatJson did not return valid JSON: ${line}`);
  assert.strictEqual(parsed.ts, entry.timestamp, `ts mismatch: ${JSON.stringify(parsed)}`);
  assert.strictEqual(
    parsed.request_id,
    entry.requestId,
    `request_id mismatch: ${JSON.stringify(parsed)}`
  );
  assert.strictEqual(parsed.ip, entry.ip, `ip mismatch: ${JSON.stringify(parsed)}`);
  assert.strictEqual(parsed.method, entry.method, `method mismatch: ${JSON.stringify(parsed)}`);
  assert.strictEqual(parsed.path, entry.path, `path mismatch: ${JSON.stringify(parsed)}`);
  assert.strictEqual(parsed.status, entry.status, `status mismatch: ${JSON.stringify(parsed)}`);
  assert.strictEqual(parsed.bytes, entry.bytes, `bytes mismatch: ${JSON.stringify(parsed)}`);
  assert.strictEqual(
    parsed.duration_ms,
    entry.duration_ms,
    `duration_ms mismatch: ${JSON.stringify(parsed)}`
  );
});

// ---------------------------------------------------------------------------
// T-SL-001.d: AccessLog.formatJson sanitizes CR/LF in path
// ---------------------------------------------------------------------------

test("AccessLog.formatJson: sanitizes CR and LF in path", () => {
  const entry = {
    timestamp: "2026-08-06T12:34:56.789Z",
    requestId: "test-uuid-5678",
    ip: "10.0.0.1",
    method: "POST",
    path: "/foo\r\nbar",
    status: 200,
    bytes: 0,
    duration_ms: 5,
  };

  const line = AccessLog.formatJson(entry);
  const parsed = parseJsonLine(line);

  assert.ok(parsed !== null, `formatJson did not return valid JSON: ${line}`);
  assert.ok(
    !parsed.path.includes("\r") && !parsed.path.includes("\n"),
    `path contains unsanitized CR/LF: ${JSON.stringify(parsed)}`
  );
});

// ---------------------------------------------------------------------------
// T-SL-001.e: Logger.error level emits correct JSON level string
// ---------------------------------------------------------------------------

test("Logger: error level emits correct JSON level string", async () => {
  const script = makeChildScript((root, lp) =>
    `import fs from "node:fs";\n` +
    `globalThis.fs = fs;\n` +
    `globalThis.createReadStream = fs.createReadStream.bind(fs);\n` +
    `const loggerUrl = "file://${lp}";\n` +
    `const Logger = await import(loggerUrl);\n` +
    `Logger.setMode("Json");\n` +
    `Logger.log("Error", "error message");\n`
  );

  let result;
  try {
    result = await runChildScript(script);
  } catch (e) {
    throw new Error(`Child script failed to run: ${e.message}`);
  }

  const { stderrData, tmpDir, scriptPath } = result;
  try {
    const lines = stderrData.split("\n").filter((l) => l.trim().length > 0);
    const parsed = parseJsonLine(lines[0]);
    assert.ok(parsed !== null, `stderr line is not valid JSON: ${lines[0]}`);
    assert.strictEqual(
      parsed.level,
      "error",
      `Expected level 'error', got: ${JSON.stringify(parsed)}`
    );
  } finally {
    rmSync(scriptPath, { force: true });
    rmSync(tmpDir, { recursive: true, force: true });
  }
});
