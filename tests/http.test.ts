import { createRequestHandler } from "../src/server/http.mts";
import type { Config } from "../src/types.mts";
import { assertEquals } from "@std/assert";
import { stub } from "@std/testing/mock";

const createConfig = (overrides: Partial<Config> = {}): Config => ({
  directory: Deno.cwd(),
  port: 8080,
  ignorePatterns: [".git", "node_modules", ".DS_Store"],
  enableDirectoryListing: true,
  logLevel: "error",
  enableLiveReload: false,
  restartOnChange: false,
  allowProtectedDir: false,
  ...overrides,
});

Deno.test("createRequestHandler: rejects unsupported HTTP method", async () => {
  const handler = createRequestHandler(createConfig());
  const request = new Request("http://localhost/README.md", {
    method: "POST",
  });

  const response = await handler(request);

  assertEquals(response.status, 405);
  assertEquals(response.headers.get("allow"), "GET, HEAD");
});

Deno.test("createRequestHandler: malformed URL path returns 400", async () => {
  const handler = createRequestHandler(createConfig());
  const request = new Request("http://localhost/%");

  const response = await handler(request);

  assertEquals(response.status, 400);
});

Deno.test("createRequestHandler: ignored file cannot be accessed directly", async () => {
  const handler = createRequestHandler(
    createConfig({ ignorePatterns: ["README.md"] }),
  );
  const request = new Request("http://localhost/README.md");

  const response = await handler(request);

  assertEquals(response.status, 403);
});

Deno.test("createRequestHandler: HEAD returns headers without body", async () => {
  const handler = createRequestHandler(createConfig());
  const request = new Request("http://localhost/file.txt", {
    method: "HEAD",
  });

  const statStub = stub(Deno, "stat", async () =>
    await Promise.resolve({
      isFile: true,
      isDirectory: false,
      isSymlink: false,
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
    } as Deno.FileInfo));

  let response: Response;
  try {
    response = await handler(request);
  } finally {
    statStub.restore();
  }

  const body = await response.text();

  assertEquals(response.status, 200);
  assertEquals(response.headers.get("content-type") !== null, true);
  assertEquals(body, "");
});
