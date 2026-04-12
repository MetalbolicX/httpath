import type { Config } from "../types.mts";
import { debounce, log } from "../utils";
import { notifyLiveReloadClients } from "../server";
import {
  shouldIgnoreEvent,
  shouldRestartServer,
  shouldTriggerBrowserReload,
} from "./rules.mts";

let isProcessingChange = false;

export const reloadServer = (entrypoint?: string): void => {
  log("Reloading server...");

  const script = entrypoint ?? "httpath.ts";

  const command = new Deno.Command(Deno.execPath(), {
    args: [
      "run",
      "-NR",
      "--allow-run",
      "--sloppy-imports",
      script,
      ...Deno.args,
    ],
    stdout: "inherit",
    stderr: "inherit",
  });

  command.spawn();
  Deno.exit(0);
};

export const startFileWatcher = async (
  config: Config,
  abortController: AbortController,
  entrypoint?: string,
): Promise<void> => {
  const watcher = Deno.watchFs(config.directory);

  log(`Watching for file changes in: ${config.directory}`);
  if (config.restartOnChange) {
    log("Mode: Server restart on file changes");
  } else {
    log("Mode: Browser reload on file changes (server stays alive)");
  }

  for await (const event of watcher) {
    if (abortController.signal.aborted) break;
    if (shouldIgnoreEvent(event, config.ignorePatterns)) continue;

    if (isProcessingChange) {
      log(
        `Skipping duplicate file change event: ${event.kind} - ${
          event.paths.join(", ")
        }`,
        "debug",
      );
      continue;
    }

    log(`File change detected: ${event.kind} - ${event.paths.join(", ")}`);
    isProcessingChange = true;

    try {
      await debounce(500);
      if (abortController.signal.aborted) continue;

      if (config.restartOnChange) {
        log("Legacy mode: Restarting server for any file change");
        if (config.enableLiveReload) {
          notifyLiveReloadClients("server restart");
          await new Promise((resolve) => setTimeout(resolve, 100));
        }
        reloadServer(entrypoint);
      } else {
        const shouldRestart = shouldRestartServer(event.paths);
        const shouldReload = shouldTriggerBrowserReload(event.paths);

        log(
          `File analysis: restart=${shouldRestart}, reload=${shouldReload}`,
          "debug",
        );

        if (shouldRestart) {
          log(
            "Server configuration files changed, restarting server...",
          );
          if (config.enableLiveReload) {
            notifyLiveReloadClients("server restart");
            await new Promise((resolve) => setTimeout(resolve, 100));
          }
          reloadServer(entrypoint);
        } else if (shouldReload && config.enableLiveReload) {
          log("Frontend files changed, triggering browser reload...");
          notifyLiveReloadClients("frontend change");
        } else {
          log(
            "File change detected but no action taken (not a monitored file type)",
          );
        }
      }
    } finally {
      setTimeout(() => {
        isProcessingChange = false;
      }, 1000);
    }
  }
};
