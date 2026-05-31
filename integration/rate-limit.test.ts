import { assertEquals } from "@std/assert";
import { startHttpath } from "./_test_utils.ts";

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

Deno.test("integration-rate-limit-reset-and-spoofing", async () => {
  const tmpDir = await Deno.makeTempDir();
  const indexPath = `${tmpDir}/index.html`;
  await Deno.writeTextFile(indexPath, "<html><body>rate limit</body></html>");
  let server: ReturnType<typeof startHttpath> | null = null;

  try {
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
        "--rate-limit-max-requests",
        "1",
        "--rate-limit-window-ms",
        "250",
      ],
    });

    const activeServer = server;
    if (!activeServer) {
      throw new Error("Rate-limit test server failed to start");
    }

    const startup = await activeServer.readUntil(
      /Starting server on http:\/\/localhost:(\d+)/,
    );
    const port = Number(startup[1]);
    const baseUrl = `http://127.0.0.1:${port}`;

    const firstRes = await fetch(baseUrl, {
      headers: { "x-forwarded-for": "203.0.113.10" },
    });
    assertEquals(firstRes.status, 200);
    await firstRes.text();

    const limitedRes = await fetch(baseUrl, {
      headers: { "x-forwarded-for": "198.51.100.77" },
    });
    assertEquals(limitedRes.status, 429);
    assertEquals(await limitedRes.text(), "Too Many Requests");

    const deadline = Date.now() + 2_000;
    let resetRes: Response | null = null;

    while (Date.now() < deadline) {
      await sleep(50);
      resetRes = await fetch(baseUrl);
      await resetRes.text();
      if (resetRes.status === 200) break;
    }

    assertEquals(resetRes?.status, 200);
  } finally {
    if (server) {
      await server.shutdown();
    }

    try {
      await Deno.remove(tmpDir, { recursive: true });
    } catch {
      // ignore
    }
  }
});
