// Scrypt.mjs — Node.js scrypt helper with lowercase field names.
// The Node.js crypto module uses uppercase N ({N, r, p}), but ReScript
// record fields must be lowercase. This module bridges that gap.

import { scryptSync as nodeScryptSync, randomBytes } from "node:crypto";
import { Buffer } from "node:buffer";

/**
 * Compute scrypt hash with explicit parameters.
 * @param {string} password
 * @param {string} saltBase64 — base64-encoded salt
 * @param {number} keylen — output length in bytes (64 for our use)
 * @param {{n: number, r: number, p: number}} opts — lowercase field names
 * @returns {Buffer} derived key
 */
export function scryptSync(password, saltBase64, keylen, opts) {
  const salt = Buffer.from(saltBase64, "base64");
  return nodeScryptSync(password, salt, keylen, {
    N: opts.n,
    r: opts.r,
    p: opts.p,
  });
}

/**
 * Generate cryptographically random bytes and return as base64.
 * @param {number} bytes
 * @returns {string} base64-encoded random bytes
 */
export function randomBytesBase64(bytes) {
  return randomBytes(bytes).toString("base64");
}
