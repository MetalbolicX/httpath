const HTTPATH_SCRIPT = new URL("../httpath.ts", import.meta.url).href;

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

export interface SpawnHttpathOptions {
  appArgs: string[];
  cwd: string;
  envFilePath?: string;
  env?: Record<string, string>;
}

export interface SpawnedHttpath {
  proc: Deno.ChildProcess;
  readUntil: (pattern: RegExp, timeoutMs?: number) => Promise<RegExpMatchArray>;
  shutdown: () => Promise<void>;
}

export const startHttpath = ({
  appArgs,
  cwd,
  envFilePath,
  env,
}: SpawnHttpathOptions): SpawnedHttpath => {
  const args = [
    "run",
    "-RN",
    "--allow-run",
    "--allow-env",
    "--sloppy-imports",
    ...(envFilePath ? [`--env-file=${envFilePath}`] : []),
    HTTPATH_SCRIPT,
    ...appArgs,
  ];

  const proc = new Deno.Command("deno", {
    args,
    cwd,
    env,
    stdout: "piped",
    stderr: "piped",
  }).spawn();

  const stdoutReader = proc.stdout.getReader();
  const stderrReader = proc.stderr.getReader();
  let stdoutBuffer = "";

  const readUntil = async (
    pattern: RegExp,
    timeoutMs = 10_000,
  ): Promise<RegExpMatchArray> => {
    const deadline = Date.now() + timeoutMs;

    while (Date.now() < deadline) {
      const match = stdoutBuffer.match(pattern);
      if (match) return match;

      const remaining = deadline - Date.now();
      const { value, done } = await withTimeout(
        stdoutReader.read(),
        Math.max(1, remaining),
      );

      if (done) {
        throw new Error(
          `Process exited before matching ${pattern}: ${stdoutBuffer}`,
        );
      }

      if (value) {
        stdoutBuffer += decoder.decode(value, { stream: true });
      }
    }

    throw new Error(`Timed out waiting for ${pattern}: ${stdoutBuffer}`);
  };

  const shutdown = async (): Promise<void> => {
    try {
      await stdoutReader.cancel();
    } catch {
      // ignore
    }

    try {
      await stderrReader.cancel();
    } catch {
      // ignore
    }

    try {
      proc.kill();
      await proc.status;
    } catch {
      // ignore
    }
  };

  return { proc, readUntil, shutdown };
};
