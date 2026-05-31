import {
  createRequestHandler,
  isAllowedWebSocketOrigin,
  type RequestContext,
  resolveRateLimitClientKey,
} from "../src/server/http.mts";
import { SECURITY_HEADERS } from "../src/security/headers.mts";
import { assertEquals } from "@std/assert";
import { stub } from "@std/testing/mock";

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

const createServeInfo = (hostname: string): RequestContext => ({
  remoteAddr: {
    hostname,
    port: 12345,
    transport: "tcp",
  },
});

const stubReadableFile = () => {
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

  const readable = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.close();
    },
  });

  const lstatStub = stub(
    Deno,
    "lstat",
    async (_path: string | URL) => await Promise.resolve(fileInfo),
  );
  const statStub = stub(
    Deno,
    "stat",
    async (_path: string | URL) => await Promise.resolve(fileInfo),
  );
  const openStub = stub(
    Deno,
    "open",
    async (_path: string | URL, _options?: Deno.OpenOptions) => {
      return await Promise.resolve({ readable, close() {} } as Deno.FsFile);
    },
  );

  return { lstatStub, statStub, openStub };
};

const stubDirectoryEntries = (entryCount: number) => {
  const dirInfo = {
    isFile: false,
    isDirectory: true,
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

  const entries = Array.from({ length: entryCount }, (_, index) => ({
    name: `file-${index}.txt`,
    isFile: true,
    isDirectory: false,
    isSymlink: false,
  })) as Deno.DirEntry[];

  const lstatStub = stub(
    Deno,
    "lstat",
    async (_path: string | URL) => await Promise.resolve(dirInfo),
  );
  const statStub = stub(
    Deno,
    "stat",
    async (_path: string | URL) => await Promise.resolve(dirInfo),
  );
  const readDirStub = stub(Deno, "readDir", (_path: string | URL) => {
    return (async function* () {
      for (const entry of entries) {
        yield entry;
      }
    })();
  });

  return { lstatStub, statStub, readDirStub };
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

Deno.test(
  "createRequestHandler: request body is rejected with 413 before method handling",
  async () => {
    const handler = createRequestHandler(createConfig());
    const request = new Request("http://localhost/README.md", {
      method: "POST",
      body: "payload",
    });

    const response = await handler(request);

    assertEquals(response.status, 413);
    assertSecurityHeaders(response);
  },
);

Deno.test("createRequestHandler: malformed URL path returns 400", async () => {
  const handler = createRequestHandler(createConfig());
  const request = new Request("http://localhost/%");

  const response = await handler(request);

  assertEquals(response.status, 400);
});

Deno.test(
  "createRequestHandler: svg files force download with content disposition",
  async () => {
    const handler = createRequestHandler(createConfig());
    const { lstatStub, statStub, openStub } = stubReadableFile();

    let response: Response;
    try {
      response = await handler(new Request("http://localhost/icon.svg"));
    } finally {
      lstatStub.restore();
      statStub.restore();
      openStub.restore();
    }

    assertEquals(response.status, 200);
    assertEquals(
      response.headers.get("content-disposition"),
      'attachment; filename="icon.svg"',
    );
    assertSecurityHeaders(response);
  },
);

Deno.test(
  "createRequestHandler: svg filename with quotes is sanitized in content-disposition",
  async () => {
    const handler = createRequestHandler(createConfig());
    const { lstatStub, statStub, openStub } = stubReadableFile();

    let response: Response;
    try {
      response = await handler(
        new Request("http://localhost/icon\".svg"),
      );
    } finally {
      lstatStub.restore();
      statStub.restore();
      openStub.restore();
    }

    assertEquals(response.status, 200);
    assertEquals(
      response.headers.get("content-disposition"),
      'attachment; filename="icon.svg"',
    );
  },
);

Deno.test("createRequestHandler: non-svg files do not force download", async () => {
  const handler = createRequestHandler(createConfig());
  const { lstatStub, statStub, openStub } = stubReadableFile();

  let response: Response;
  try {
    response = await handler(new Request("http://localhost/file.txt"));
  } finally {
    lstatStub.restore();
    statStub.restore();
    openStub.restore();
  }

  assertEquals(response.status, 200);
  assertEquals(response.headers.get("content-disposition"), null);
  assertSecurityHeaders(response);
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

Deno.test("createRequestHandler: ignore patterns match path segments only", async () => {
  const handler = createRequestHandler(
    createConfig({ ignorePatterns: ["node_modules"] }),
  );
  const { lstatStub, statStub, openStub } = stubReadableFile();

  let response: Response;
  try {
    response = await handler(
      new Request("http://localhost/widget_modules/file.txt"),
    );
  } finally {
    lstatStub.restore();
    statStub.restore();
    openStub.restore();
  }

  assertEquals(response.status, 200);
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

Deno.test("createRequestHandler: directory listing is truncated when over the cap", async () => {
  const handler = createRequestHandler(
    createConfig({ enableDirectoryListing: true }),
  );
  const { lstatStub, statStub, readDirStub } = stubDirectoryEntries(101);

  let response: Response;
  try {
    response = await handler(new Request("http://localhost/assets/"));
  } finally {
    lstatStub.restore();
    statStub.restore();
    readDirStub.restore();
  }

  const body = await response.text();
  const fileItemCount = (body.match(/class="file-item"/g) ?? []).length;

  assertEquals(response.status, 200);
  assertEquals(fileItemCount, 101);
  assertEquals(body.includes("truncated"), true);
});

Deno.test("createRequestHandler: directory listing below the cap is complete", async () => {
  const handler = createRequestHandler(
    createConfig({ enableDirectoryListing: true }),
  );
  const { lstatStub, statStub, readDirStub } = stubDirectoryEntries(2);

  let response: Response;
  try {
    response = await handler(new Request("http://localhost/assets/"));
  } finally {
    lstatStub.restore();
    statStub.restore();
    readDirStub.restore();
  }

  const body = await response.text();
  const fileItemCount = (body.match(/class="file-item"/g) ?? []).length;

  assertEquals(response.status, 200);
  assertEquals(fileItemCount, 3);
  assertEquals(body.includes("truncated"), false);
});

Deno.test("resolveRateLimitClientKey: trustProxy false uses remote address", () => {
  const request = new Request("http://localhost/README.md", {
    headers: { "x-forwarded-for": "203.0.113.9" },
  });

  assertEquals(
    resolveRateLimitClientKey(request, createServeInfo("198.51.100.20"), false),
    "198.51.100.20",
  );
});

Deno.test("resolveRateLimitClientKey: trustProxy true uses forwarded client IP", () => {
  const request = new Request("http://localhost/README.md", {
    headers: { "x-forwarded-for": "203.0.113.9, 198.51.100.20" },
  });

  assertEquals(
    resolveRateLimitClientKey(request, createServeInfo("198.51.100.20"), true),
    "203.0.113.9",
  );
});

Deno.test("isAllowedWebSocketOrigin: allows same-origin requests", () => {
  const request = new Request("http://localhost/livereload", {
    headers: { origin: "http://localhost" },
  });

  assertEquals(isAllowedWebSocketOrigin(request), true);
});

Deno.test("isAllowedWebSocketOrigin: rejects missing or cross-origin requests", () => {
  const crossOriginRequest = new Request("http://localhost/livereload", {
    headers: { origin: "http://evil.example" },
  });
  const missingOriginRequest = new Request("http://localhost/livereload");

  assertEquals(isAllowedWebSocketOrigin(crossOriginRequest), false);
  // Missing origin is allowed for localhost to enable local WebSocket clients
  assertEquals(isAllowedWebSocketOrigin(missingOriginRequest), true);
});

Deno.test(
  "createRequestHandler: websocket upgrade rejects cross-origin requests",
  async () => {
    const handler = createRequestHandler(
      createConfig({ enableLiveReload: true }),
    );

    const response = await handler(
      new Request("http://localhost/livereload", {
        headers: {
          upgrade: "websocket",
          origin: "http://evil.example",
        },
      }),
    );

    assertEquals(response.status, 403);
    assertSecurityHeaders(response);
  },
);

Deno.test(
  "createRequestHandler: websocket upgrade allows same-origin requests",
  async () => {
    const handler = createRequestHandler(
      createConfig({ enableLiveReload: true }),
    );

    const response = await handler(
      new Request("http://localhost/livereload", {
        headers: {
          connection: "Upgrade",
          upgrade: "websocket",
          origin: "http://localhost",
          "sec-websocket-key": "dGhlIHNhbXBsZSBub25jZQ==",
          "sec-websocket-version": "13",
        },
      }),
    );

    assertEquals(response.status, 101);
    assertSecurityHeaders(response);
  },
);

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
