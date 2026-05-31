import { assertEquals } from "@std/assert";
import { startHttpath } from "./_test_utils.ts";

const decoder = new TextDecoder();

const withTimeout = <T>(promise: Promise<T>, timeoutMs: number): Promise<T> =>
  new Promise((resolve, reject) => {
    const timeoutId = setTimeout(() => {
      reject(new Error(`Timed out after ${timeoutMs}ms`));
    }, timeoutMs);

    promise.then(
      (value) => {
        clearTimeout(timeoutId);
        resolve(value);
      },
      (error) => {
        clearTimeout(timeoutId);
        reject(error);
      },
    );
  });

const readUntil = async (
  reader: ReadableStreamDefaultReader<Uint8Array>,
  pattern: RegExp,
  timeoutMs = 10_000,
  getDebugText?: () => string,
): Promise<RegExpMatchArray> => {
  let buffer = "";
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    const match = buffer.match(pattern);
    if (match) return match;

    const remaining = Math.max(1, deadline - Date.now());
    const { value, done } = await withTimeout(reader.read(), remaining);

    if (done) {
      throw new Error(
        `Process exited before matching ${pattern}: ${buffer}${
          getDebugText ? ` stderr: ${getDebugText()}` : ""
        }`,
      );
    }

    if (value) {
      buffer += decoder.decode(value, { stream: true });
    }
  }

  throw new Error(
    `Timed out waiting for ${pattern}: ${buffer}${
      getDebugText ? ` stderr: ${getDebugText()}` : ""
    }`,
  );
};

const startWebSocketClient = (port: number, scriptPath: string) => {
  const proc = new Deno.Command("deno", {
    args: [
      "run",
      `--location=http://localhost:${port}`,
      "--allow-net",
      scriptPath,
    ],
    stdout: "piped",
    stderr: "piped",
  }).spawn();

  const stdoutReader = proc.stdout.getReader();
  const stderrReader = proc.stderr.getReader();
  let stderrBuffer = "";

  const stderrPump = (async () => {
    while (true) {
      const { value, done } = await stderrReader.read();
      if (done) break;
      if (value) {
        stderrBuffer += decoder.decode(value, { stream: true });
      }
    }
  })();

  return {
    proc,
    stdoutReader,
    stderrPump,
    getStderr: () => stderrBuffer,
  };
};

Deno.test("integration-websocket-reload", async () => {
  const tmpDir = await Deno.makeTempDir();
  const indexPath = `${tmpDir}/index.html`;
  const clientScriptPath = `${tmpDir}/websocket-client.ts`;
  let server: ReturnType<typeof startHttpath> | null = null;
  let client:
    | ReturnType<typeof startWebSocketClient>
    | null = null;

  try {
    await Deno.writeTextFile(
      indexPath,
      "<!doctype html><html><body>hello</body></html>",
    );

    server = startHttpath({
      cwd: tmpDir,
      env: {
        HTTPATH_USER: "",
        HTTPATH_PASS: "",
      },
      appArgs: ["--port", "0", "--dir", tmpDir],
    });

    const startup = await server.readUntil(
      /Starting server on http:\/\/localhost:(\d+)/,
    );
    const port = Number(startup[1]);
    await server.readUntil(/Watching for file changes in:/);

    await Deno.writeTextFile(
      clientScriptPath,
      [
        `const socket = new WebSocket("ws://localhost:${port}/livereload");`,
        `await new Promise((resolve, reject) => {`,
        `  socket.addEventListener("open", () => { console.log("connected"); resolve(); }, { once: true });`,
        `  socket.addEventListener("error", () => reject(new Error("WebSocket connection failed")), { once: true });`,
        `});`,
        `const message = await new Promise((resolve, reject) => {`,
        `  socket.addEventListener("message", (event) => resolve(String(event.data)), { once: true });`,
        `  socket.addEventListener("error", () => reject(new Error("WebSocket error before reload message")), { once: true });`,
        `});`,
        `console.log(message);`,
        `socket.close();`,
      ].join("\n"),
    );

    client = startWebSocketClient(port, clientScriptPath);
    await readUntil(client.stdoutReader, /connected/, 10_000, client.getStderr);

    const reloadPromise = readUntil(
      client.stdoutReader,
      /reload/,
      10_000,
      client.getStderr,
    );
    await Deno.writeTextFile(
      indexPath,
      "<!doctype html><html><body>updated</body></html>",
    );

    const reloadMatch = await reloadPromise;
    assertEquals(reloadMatch[0], "reload");
  } finally {
    if (client) {
      try {
        await client.stdoutReader.cancel();
      } catch {
        // ignore
      }
      try {
        client.proc.kill();
        await client.proc.status;
      } catch {
        // ignore
      }
      try {
        await client.stderrPump;
      } catch {
        // ignore
      }
    }

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
