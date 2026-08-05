#!/usr/bin/env node
// scripts/gen-auth.mjs — Generate a scrypt credential line for .httpath-auth.
// Zero npm runtime deps: uses only node:crypto, node:fs, node:readline.

import { createReadStream, appendFileSync, chmodSync, openSync, closeSync, writeSync } from "node:fs";
import { readFileSync } from "node:fs";
import { createInterface } from "node:readline";
import { randomBytes, scryptSync } from "node:crypto";
import { resolve, join } from "node:path";
import { cwd } from "node:process";

const SCRYPT_PARAMS = "N=16384,r=8,p=1";
const KEYLEN = 64; // scrypt output length in bytes

/**
 * Prompt for a password using readline, with echo disabled.
 * @param {string} prompt
 * @returns {Promise<string>}
 */
function promptPassword(prompt) {
  return new Promise((resolve) => {
    const rl = createInterface({
      input: createReadStream("/dev/tty"),
      output: process.stdout,
    });
    rl.question(prompt, (answer) => {
      rl.close();
      resolve(answer);
    });
  });
}

/**
 * Read password from stdin (for non-interactive use).
 * @returns {Promise<string>}
 */
async function readPasswordInteractively() {
  return new Promise((resolve) => {
    const rl = createInterface({ input: process.stdin });
    let password = "";
    rl.on("line", (line) => {
      password = line;
    });
    rl.on("close", () => {
      resolve(password);
    });
  });
}

/**
 * Generate a .httpath-auth entry for the given username and password.
 * @param {string} username
 * @param {string} password
 * @returns {string}
 */
function generateEntry(username, password) {
  const salt = randomBytes(16);
  const saltB64 = salt.toString("base64");
  const hash = scryptSync(password, salt, KEYLEN, {
    N: 16384,
    r: 8,
    p: 1,
  });
  const hashB64 = hash.toString("base64");
  return `${username}:${SCRYPT_PARAMS}$${saltB64}$${hashB64}`;
}

/**
 * Write an auth entry to the auth file with mode 0600.
 * @param {string} authPath
 * @param {string} line
 */
function appendToAuthFile(authPath, line) {
  // Create file if missing, append the entry
  appendFileSync(authPath, line + "\n", "utf8");
  // Set mode 0600 on Unix; warn on Windows
  try {
    chmodSync(authPath, 0o600);
  } catch (err) {
    if (err.code === "ENOENT") {
      // File didn't exist — create with 0600 using open/create
      const fd = openSync(authPath, "w", 0o600);
      writeSync(fd, line + "\n", "utf8");
      closeSync(fd);
    } else if (err.code === "EOPNOTSUPP" || err.code === "EINVAL") {
      // Filesystem doesn't support chmod (Windows with NTFS, some network fs)
      console.error("Warning: could not set .httpath-auth to mode 0600 (filesystem limitation)");
    } else {
      throw err;
    }
  }
}

async function main() {
  const args = process.argv.slice(2);

  if (args.length === 0) {
    console.error("Usage: node scripts/gen-auth.mjs <username> [password]");
    console.error("  <username>    — required; the Basic Auth username");
    console.error("  [password]    — optional; if omitted, password is prompted securely");
    process.exit(1);
  }

  const username = args[0];
  let password;

  if (args.length >= 2) {
    console.error("Warning: passing password as a command-line argument is insecure. Use interactive mode:");
    console.error(`  node scripts/gen-auth.mjs ${username}`);
    password = args[1];
  } else {
    // Interactive mode: prompt for password with echo disabled
    password = await promptPassword(`Password for '${username}': `);
  }

  if (!username || username.trim() === "") {
    console.error("Error: username cannot be empty");
    process.exit(1);
  }

  if (!password || password === "") {
    console.error("Error: password cannot be empty");
    process.exit(1);
  }

  const entry = generateEntry(username, password);
  const authPath = resolve(cwd(), ".httpath-auth");

  try {
    appendToAuthFile(authPath, entry);
  } catch (err) {
    console.error(`Error: could not write to ${authPath}: ${err.message}`);
    process.exit(1);
  }

  console.log(`Auth entry added to ${authPath}:`);
  console.log(entry);
  process.exit(0);
}

main().catch((err) => {
  console.error(`Unexpected error: ${err.message}`);
  process.exit(1);
});
