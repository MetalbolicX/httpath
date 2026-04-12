import { resolveSafePath } from "../src/utils/path.mts";
import { resolve } from "@std/path";
import { assertEquals } from "@std/assert";

const TEST_DIR = "/tmp/httpath_test";

Deno.test("resolveSafePath: normal file inside base returns resolved path", () => {
  const base = resolve(TEST_DIR);
  const result = resolveSafePath(base, "file.txt");
  assertEquals(result, resolve(base, "file.txt"));
});

Deno.test("resolveSafePath: subdirectory file returns resolved path", () => {
  const base = resolve(TEST_DIR);
  const result = resolveSafePath(base, "subdir/file.txt");
  assertEquals(result, resolve(base, "subdir/file.txt"));
});

Deno.test("resolveSafePath: traversal attempt returns null", () => {
  const base = resolve(TEST_DIR);
  assertEquals(resolveSafePath(base, "../etc/passwd"), null);
});

Deno.test("resolveSafePath: multi-dot traversal returns null", () => {
  const base = resolve(TEST_DIR);
  assertEquals(resolveSafePath(base, "../../../etc/passwd"), null);
});

Deno.test("resolveSafePath: URL-encoded traversal returns null", () => {
  const base = resolve(TEST_DIR);
  assertEquals(resolveSafePath(base, "..%2F..%2F..%2Fetc%2Fpasswd"), null);
});

Deno.test("resolveSafePath: path that resolves to base itself returns base", () => {
  const base = resolve(TEST_DIR);
  const result = resolveSafePath(base, ".");
  assertEquals(result, base);
});

Deno.test("resolveSafePath: double-dot that stays inside returns resolved path", () => {
  const base = resolve(TEST_DIR, "a");
  const result = resolveSafePath(base, "../a/file.txt");
  assertEquals(result, resolve(base, "file.txt"));
});

Deno.test("resolveSafePath: non-existent path returns resolved path (no error)", () => {
  const base = resolve(TEST_DIR);
  const result = resolveSafePath(base, "nonexistent.txt");
  assertEquals(result, resolve(base, "nonexistent.txt"));
});

Deno.test("resolveSafePath: empty path resolves to base dir", () => {
  const base = resolve(TEST_DIR);
  assertEquals(resolveSafePath(base, ""), base);
});

Deno.test("resolveSafePath: deeply nested path inside returns resolved path", () => {
  const base = resolve(TEST_DIR);
  const result = resolveSafePath(base, "a/b/c/d/file.txt");
  assertEquals(result, resolve(base, "a/b/c/d/file.txt"));
});
