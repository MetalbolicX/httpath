import {
  isProtectedSystemPath,
  matchesPattern,
  resolveSafePath,
} from "../src/utils/path.mts";
import { createRequestHandler } from "../src/server/http.mts";
import { resolve } from "@std/path";
import { assertEquals } from "@std/assert";
import { stub } from "@std/testing/mock";

const TEST_DIR = "/tmp/httpath_test";

const createConfig = (overrides = {}) => ({
  directory: Deno.cwd(),
  hostname: "127.0.0.1",
  port: 8080,
  rateLimitMaxRequests: 5,
  rateLimitWindowMs: 60_000,
  ignorePatterns: [".git", "node_modules", ".DS_Store"],
  enableDirectoryListing: true,
  logLevel: "error" as const,
  enableLiveReload: false,
  restartOnChange: false,
  trustProxy: false,
  allowProtectedDir: false,
  ...overrides,
});

const stubFileInfo = (isSymlink: boolean) => ({
  isFile: !isSymlink,
  isDirectory: false,
  isSymlink,
  size: 0,
  mtime: null,
  atime: null,
  birthtime: null,
  dev: 0,
  ino: 0,
  mode: null,
  nlink: null,
  uid: null,
  gid: null,
  rdev: null,
  blksize: null,
  blocks: null,
  isBlockDevice: false,
  isCharDevice: false,
  isFifo: false,
  isSocket: false,
} as Deno.FileInfo);

const stubSymlinkEntry = () => {
  const lstatStub = stub(
    Deno,
    "lstat",
    async () => await Promise.resolve(stubFileInfo(true)),
  );
  const statStub = stub(
    Deno,
    "stat",
    async () => await Promise.resolve(stubFileInfo(false)),
  );

  return { lstatStub, statStub };
};

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

Deno.test("matchesPattern: matches full path segments", () => {
  assertEquals(
    matchesPattern("src/node_modules/package/index.js", ["node_modules"]),
    true,
  );
});

Deno.test("matchesPattern: does not match partial substrings", () => {
  assertEquals(matchesPattern("src/.gitignore", [".git"]), false);
});

Deno.test("createRequestHandler: rejects symlinked file paths", async () => {
  const handler = createRequestHandler(createConfig());
  const { lstatStub, statStub } = stubSymlinkEntry();

  let response: Response;
  try {
    response = await handler(new Request("http://localhost/linked-file.txt"));
  } finally {
    lstatStub.restore();
    statStub.restore();
  }

  assertEquals(response.status, 403);
});

Deno.test("createRequestHandler: rejects symlinked intermediate path segments", async () => {
  const handler = createRequestHandler(createConfig());
  const lstatStub = stub(Deno, "lstat", async (path: string | URL) => {
    const pathText = typeof path === "string" ? path : path.pathname;
    if (pathText.endsWith("/linked")) {
      return await Promise.resolve(stubFileInfo(true));
    }

    return await Promise.resolve(stubFileInfo(false));
  });
  const statStub = stub(
    Deno,
    "stat",
    async () => await Promise.resolve(stubFileInfo(false)),
  );

  let response: Response;
  try {
    response = await handler(new Request("http://localhost/linked/file.txt"));
  } finally {
    lstatStub.restore();
    statStub.restore();
  }

  assertEquals(response.status, 403);
});

Deno.test("createRequestHandler: rejects symlinked directory paths", async () => {
  const handler = createRequestHandler(createConfig());
  const { lstatStub, statStub } = stubSymlinkEntry();

  let response: Response;
  try {
    response = await handler(new Request("http://localhost/linked-dir/"));
  } finally {
    lstatStub.restore();
    statStub.restore();
  }

  assertEquals(response.status, 403);
});

// ---------------------------------------------------------------------------
// isProtectedSystemPath
// Tests are written against the real current OS so the blocklist is exercised
// on whatever platform the test suite runs.
// ---------------------------------------------------------------------------

const IS_WINDOWS = Deno.build.os === "windows";
const IS_MACOS = Deno.build.os === "darwin";

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
  name:
    "isProtectedSystemPath: /System/Library/CoreServices is blocked on macOS",
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
