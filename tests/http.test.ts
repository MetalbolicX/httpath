import { createRequestHandler } from "../src/server/http.mts";
import { SECURITY_HEADERS } from "../src/security/headers.mts";
import { assertEquals } from "@std/assert";
import { stub } from "@std/testing/mock";

const createConfig = (overrides = {}) => ({
  directory: Deno.cwd(),
  hostname: "127.0.0.1",
  port: 8080,
  ignorePatterns: [".git", "node_modules", ".DS_Store"],
  enableDirectoryListing: true,
  logLevel: "error" as const,
  enableLiveReload: false,
  restartOnChange: false,
  allowProtectedDir: false,
  ...overrides,
});

const stubReadableFileInfo = () => {
  const fileInfo = {
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
  } as Deno.FileInfo;

  const lstatStub = stub(
    Deno,
    "lstat",
    async () => await Promise.resolve(fileInfo),
  );
  const statStub = stub(
    Deno,
    "stat",
    async () => await Promise.resolve(fileInfo),
  );

  return { lstatStub, statStub };
};

const stubNotFoundInfo = () => {
  const lstatStub = stub(Deno, "lstat", () => {
    throw new Deno.errors.NotFound("missing");
  });
  const statStub = stub(Deno, "stat", () => {
    throw new Error("stat should not be called after NotFound");
  });

  return { lstatStub, statStub };
};

const assertSecurityHeaders = (response: Response) => {
  for (const [key, value] of Object.entries(SECURITY_HEADERS)) {
    assertEquals(response.headers.get(key), value);
  }
};

Deno.test("createRequestHandler: rejects unsupported HTTP method", async () => {
  const handler = createRequestHandler(createConfig());
  const request = new Request("http://localhost/README.md", {
    method: "POST",
  });

  const response = await handler(request);

  assertEquals(response.status, 405);
  assertEquals(response.headers.get("allow"), "GET, HEAD");
  assertSecurityHeaders(response);
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
  assertSecurityHeaders(response);
});

Deno.test("createRequestHandler: HEAD returns headers without body", async () => {
  const handler = createRequestHandler(createConfig());
  const request = new Request("http://localhost/file.txt", {
    method: "HEAD",
  });

  const { lstatStub, statStub } = stubReadableFileInfo();

  let response: Response;
  try {
    response = await handler(request);
  } finally {
    lstatStub.restore();
    statStub.restore();
  }

  const body = await response.text();

  assertEquals(response.status, 200);
  assertEquals(response.headers.get("content-type") !== null, true);
  assertEquals(response.headers.get("x-content-type-options"), "nosniff");
  assertSecurityHeaders(response);
  assertEquals(body, "");
});

// --- Basic Auth ---

Deno.test("createRequestHandler: no auth config — request passes through", async () => {
  // Stub Deno.stat so we don't need --allow-read; the point is that no-auth
  // means the request is not short-circuited by the auth layer (404/500/200
  // all confirm the handler proceeded, only 401 would indicate auth blocked).
  const { lstatStub, statStub } = stubReadableFileInfo();

  let response: Response;
  try {
    const handler = createRequestHandler(createConfig());
    const request = new Request("http://localhost/file.txt");
    response = await handler(request);
    // status is NOT 401 means auth didn't block — exact status depends on
    // Deno.open succeeding (needs --allow-read in real usage).
    assertEquals(response.status !== 401, true);
  } finally {
    lstatStub.restore();
    statStub.restore();
  }
});

Deno.test("createRequestHandler: auth enabled — missing header returns 401", async () => {
  const handler = createRequestHandler(
    createConfig({ auth: { username: "admin", password: "secret" } }),
  );
  const request = new Request("http://localhost/README.md");

  const response = await handler(request);

  assertEquals(response.status, 401);
  assertEquals(
    response.headers.get("www-authenticate"),
    `Basic realm="httpath"`,
  );
  assertSecurityHeaders(response);
});

Deno.test("createRequestHandler: auth enabled — valid credentials pass through", async () => {
  const { lstatStub, statStub } = stubReadableFileInfo();

  let response: Response;
  try {
    const handler = createRequestHandler(
      createConfig({ auth: { username: "admin", password: "secret" } }),
    );
    const encoded = btoa("admin:secret");
    const request = new Request("http://localhost/file.txt", {
      headers: { authorization: `Basic ${encoded}` },
    });
    response = await handler(request);
    assertEquals(response.status !== 401, true);
  } finally {
    lstatStub.restore();
    statStub.restore();
  }
});

Deno.test("createRequestHandler: auth enabled — wrong password returns 401", async () => {
  const handler = createRequestHandler(
    createConfig({ auth: { username: "admin", password: "secret" } }),
  );
  const encoded = btoa("admin:wrong");
  const request = new Request("http://localhost/README.md", {
    headers: { authorization: `Basic ${encoded}` },
  });

  const response = await handler(request);

  assertEquals(response.status, 401);
});

Deno.test("createRequestHandler: auth enabled — wrong username returns 401", async () => {
  const handler = createRequestHandler(
    createConfig({ auth: { username: "admin", password: "secret" } }),
  );
  const encoded = btoa("hacker:secret");
  const request = new Request("http://localhost/README.md", {
    headers: { authorization: `Basic ${encoded}` },
  });

  const response = await handler(request);

  assertEquals(response.status, 401);
});

Deno.test("createRequestHandler: auth enabled — malformed base64 returns 401", async () => {
  const handler = createRequestHandler(
    createConfig({ auth: { username: "admin", password: "secret" } }),
  );
  const request = new Request("http://localhost/README.md", {
    headers: { authorization: "Basic !!!not-valid-base64!!!" },
  });

  const response = await handler(request);

  assertEquals(response.status, 401);
});

Deno.test("createRequestHandler: auth enabled — password with colon works", async () => {
  const handler = createRequestHandler(
    createConfig({ auth: { username: "admin", password: "pass:with:colons" } }),
  );
  const encoded = btoa("admin:pass:with:colons");
  const request = new Request("http://localhost/README.md", {
    headers: { authorization: `Basic ${encoded}` },
  });

  const response = await handler(request);

  // Only the FIRST colon separates user from pass — multi-colon passwords must work
  assertEquals(response.status !== 401, true);
});

Deno.test("createRequestHandler: repeated failed auth triggers 429 rate limiting", async () => {
  const handler = createRequestHandler(
    createConfig({ auth: { username: "admin", password: "secret" } }),
  );

  const statuses: number[] = [];
  for (let attempt = 0; attempt < 6; attempt++) {
    const response = await handler(
      new Request("http://localhost/README.md", {
        headers: { "x-forwarded-for": "203.0.113.9" },
      }),
    );
    statuses.push(response.status);
  }

  assertEquals(statuses, [401, 401, 401, 401, 401, 429]);
});

Deno.test("createRequestHandler: websocket upgrade without auth returns 401", async () => {
  const handler = createRequestHandler(
    createConfig({
      auth: { username: "admin", password: "secret" },
      enableLiveReload: true,
    }),
  );

  const response = await handler(
    new Request("http://localhost/livereload", {
      headers: { upgrade: "websocket" },
    }),
  );

  assertEquals(response.status, 401);
  assertEquals(
    response.headers.get("www-authenticate"),
    `Basic realm="httpath"`,
  );
  assertSecurityHeaders(response);
});

Deno.test("createRequestHandler: 404 responses include security headers", async () => {
  const handler = createRequestHandler(createConfig());
  const { lstatStub, statStub } = stubNotFoundInfo();

  let response: Response;
  try {
    response = await handler(new Request("http://localhost/missing.txt"));
  } finally {
    lstatStub.restore();
    statStub.restore();
  }

  assertEquals(response.status, 404);
  assertSecurityHeaders(response);
});
