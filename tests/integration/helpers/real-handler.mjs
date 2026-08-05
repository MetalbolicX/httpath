// tests/integration/helpers/real-handler.mjs — Shared child-process helper.
// Spawns a real httpath server using Handler.make(config) for integration tests.

import { spawn } from "node:child_process";
import { writeFileSync, mkdtempSync, rmSync } from "node:fs";
import path from "node:path";

const ABS_HTTPATH = path.resolve(process.cwd(), "src/Httpath.res.mjs");
const ABS_HANDLER = path.resolve(process.cwd(), "src/Server/Handler.res.mjs");
const ABS_PARSER = path.resolve(process.cwd(), "src/Cfg/Parser.res.mjs");
const ABS_BASIC = path.resolve(process.cwd(), "src/Auth/Basic.res.mjs");

// ---------------------------------------------------------------------------
// makeChildScript — writes a child-process script that starts Httpath.start
// with Handler.make(config) wiring. Returns { scriptPath, tmpDir }.
// ---------------------------------------------------------------------------

export function makeChildScript(port, tmpDir, extraConfig) {
  const scriptPath = path.join(tmpDir, "child.mjs");
  const childScript = `
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const fs = require("node:fs");
// Fs.res.mjs uses globalThis.createReadStream (Deno global) — provide it for Node.js.
globalThis.fs = fs;
globalThis.createReadStream = fs.createReadStream.bind(fs);

import { start } from "${ABS_HTTPATH}";
import { make as makeHandler } from "${ABS_HANDLER}";
import { parse as parseArgs } from "${ABS_PARSER}";
import { searchAuthFile as searchAuth } from "${ABS_BASIC}";

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

const extraObj = ${extraConfig ? extraConfig : "undefined"};
const config = Object.assign({}, parseResult._0, extraObj);

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

// Wire real Handler.make instead of 501 stub.
const handler = makeHandler(config);

start(handler, config, authEntries);
`;
  writeFileSync(scriptPath, childScript);
  return { scriptPath };
}

// ---------------------------------------------------------------------------
// spawnHttpathWithRealHandler — spawns a real httpath child process.
// Returns { child, scriptPath, tmpDir, cleanup } after server is listening.
// ---------------------------------------------------------------------------

export function spawnHttpathWithRealHandler({ scriptPath, args, env = {}, cwd, workdir, port }) {
  // Not used directly here — callers use makeChildScript + spawn pattern.
  // This module exports the helper functions for consistency with static_handler.test.js.
  throw new Error("Use makeChildScript + spawn pattern directly");
}

// ---------------------------------------------------------------------------
// waitForChildReady — poll TCP port until child is listening.
// ---------------------------------------------------------------------------

export function waitForChildReady(child, port, timeoutMs = 3000) {
  const deadline = Date.now() + timeoutMs;
  return new Promise((resolve, reject) => {
    const net = require("node:net");
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

export function httpGet(port, urlPath, options = {}) {
  const http = require("node:http");
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
