import { assertEquals } from "@std/assert";
import { startHttpath } from "./_test_utils.ts";

Deno.test("integration-smoke-test", async () => {
  // Create temp directory with index.html and empty subdirectory
  const tmpDir = await Deno.makeTempDir();
  const indexPath = `${tmpDir}/index.html`;
  const emptyDirPath = `${tmpDir}/empty-dir`;
  let server: ReturnType<typeof startHttpath> | null = null;

  try {
    await Deno.writeTextFile(indexPath, "Hello World");
    await Deno.mkdir(emptyDirPath);

    server = startHttpath({
      cwd: tmpDir,
      env: {
        HTTPATH_USER: "",
        HTTPATH_PASS: "",
      },
      appArgs: [
        "--port",
        "0",
        "--dir",
        tmpDir,
        "--no-listing",
        "--no-live-reload",
      ],
    });

    const match = await server.readUntil(
      /Starting server on http:\/\/localhost:(\d+)/,
    );
    const port = Number(match[1]);
    assertEquals(port > 0, true, "Port should be a positive integer");

    const baseUrl = `http://localhost:${port}`;

    // Test 1: GET / returns 200 with index.html content
    const rootRes = await fetch(`${baseUrl}/`);
    assertEquals(rootRes.status, 200);
    const rootBody = await rootRes.text();
    assertEquals(rootBody, "Hello World");

    // Test 2: GET /index.html returns 200
    const indexRes = await fetch(`${baseUrl}/index.html`);
    assertEquals(indexRes.status, 200);
    await indexRes.text();

    // Test 3: GET /missing returns 404
    const missingRes = await fetch(`${baseUrl}/missing`);
    assertEquals(missingRes.status, 404);
    await missingRes.text();

    // Test 4: GET /empty-dir/ returns 403 with exact body
    const emptyDirRes = await fetch(`${baseUrl}/empty-dir/`);
    assertEquals(emptyDirRes.status, 403);
    const emptyDirBody = await emptyDirRes.text();
    assertEquals(emptyDirBody, "Directory listing disabled");
  } finally {
    if (server) {
      await server.shutdown();
    }

    // Clean up temp directory
    try {
      await Deno.remove(tmpDir, { recursive: true });
    } catch {
      // ignore
    }
  }
});
