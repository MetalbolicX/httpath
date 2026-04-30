import { isProtectedSystemPath, resolveSafePath } from "../src/utils/path.mts";
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

// ---------------------------------------------------------------------------
// isProtectedSystemPath
// Tests are written against the real current OS so the blocklist is exercised
// on whatever platform the test suite runs.
// ---------------------------------------------------------------------------

const IS_WINDOWS = Deno.build.os === "windows";
const IS_MACOS = Deno.build.os === "darwin";
const IS_LINUX = Deno.build.os === "linux";

// -- Unix (Linux + macOS) shared paths --------------------------------------

Deno.test({
  name: "isProtectedSystemPath: /etc is blocked on unix",
  ignore: IS_WINDOWS,
  fn() {
    assertEquals(isProtectedSystemPath("/etc"), true);
  },
});

Deno.test({
  name: "isProtectedSystemPath: /etc/nginx is blocked on unix",
  ignore: IS_WINDOWS,
  fn() {
    assertEquals(isProtectedSystemPath("/etc/nginx"), true);
  },
});

Deno.test({
  name: "isProtectedSystemPath: /bin is blocked on unix",
  ignore: IS_WINDOWS,
  fn() {
    assertEquals(isProtectedSystemPath("/bin"), true);
  },
});

Deno.test({
  name: "isProtectedSystemPath: /root is blocked on unix",
  ignore: IS_WINDOWS,
  fn() {
    assertEquals(isProtectedSystemPath("/root"), true);
  },
});

Deno.test({
  name: "isProtectedSystemPath: /etc-custom is NOT blocked on unix",
  ignore: IS_WINDOWS,
  fn() {
    // Must not match /etc as a prefix of /etc-custom
    assertEquals(isProtectedSystemPath("/etc-custom"), false);
  },
});

Deno.test({
  name: "isProtectedSystemPath: /home/user is NOT blocked on unix",
  ignore: IS_WINDOWS,
  fn() {
    assertEquals(isProtectedSystemPath("/home/user/project"), false);
  },
});

Deno.test({
  name: "isProtectedSystemPath: /tmp is NOT blocked on unix",
  ignore: IS_WINDOWS,
  fn() {
    assertEquals(isProtectedSystemPath("/tmp"), false);
  },
});

Deno.test({
  name: "isProtectedSystemPath: /var/www is NOT blocked on unix",
  ignore: IS_WINDOWS,
  fn() {
    assertEquals(isProtectedSystemPath("/var/www"), false);
  },
});

// -- macOS-specific paths ---------------------------------------------------

Deno.test({
  name: "isProtectedSystemPath: /System is blocked on macOS",
  ignore: !IS_MACOS,
  fn() {
    assertEquals(isProtectedSystemPath("/System"), true);
  },
});

Deno.test({
  name: "isProtectedSystemPath: /Library is blocked on macOS",
  ignore: !IS_MACOS,
  fn() {
    assertEquals(isProtectedSystemPath("/Library"), true);
  },
});

Deno.test({
  name: "isProtectedSystemPath: /System/Library/CoreServices is blocked on macOS",
  ignore: !IS_MACOS,
  fn() {
    assertEquals(isProtectedSystemPath("/System/Library/CoreServices"), true);
  },
});

// -- Windows-specific paths -------------------------------------------------

Deno.test({
  name: "isProtectedSystemPath: C:\\Windows is blocked on Windows",
  ignore: !IS_WINDOWS,
  fn() {
    assertEquals(isProtectedSystemPath("C:\\Windows"), true);
  },
});

Deno.test({
  name: "isProtectedSystemPath: C:\\Windows\\System32 is blocked on Windows",
  ignore: !IS_WINDOWS,
  fn() {
    assertEquals(isProtectedSystemPath("C:\\Windows\\System32"), true);
  },
});

Deno.test({
  name: "isProtectedSystemPath: C:\\Program Files is blocked on Windows",
  ignore: !IS_WINDOWS,
  fn() {
    assertEquals(isProtectedSystemPath("C:\\Program Files"), true);
  },
});

Deno.test({
  name: "isProtectedSystemPath: C:\\ProgramData is blocked on Windows",
  ignore: !IS_WINDOWS,
  fn() {
    assertEquals(isProtectedSystemPath("C:\\ProgramData"), true);
  },
});

Deno.test({
  name: "isProtectedSystemPath: C:\\windows (lowercase) is blocked on Windows",
  ignore: !IS_WINDOWS,
  fn() {
    // Case-insensitive on Windows
    assertEquals(isProtectedSystemPath("C:\\windows"), true);
  },
});

Deno.test({
  name: "isProtectedSystemPath: C:\\Users\\user is NOT blocked on Windows",
  ignore: !IS_WINDOWS,
  fn() {
    assertEquals(isProtectedSystemPath("C:\\Users\\user\\project"), false);
  },
});
