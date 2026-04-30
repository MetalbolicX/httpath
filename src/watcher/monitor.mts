import type { Config } from "../types.mts";
import { createDebouncer, log } from "../utils/index.ts";
import { notifyLiveReloadClients } from "../server/index.ts";
import {
  shouldIgnoreEvent,
  shouldRestartServer,
  shouldTriggerBrowserReload,
} from "./rules.mts";

let isProcessingChange = false;

/**
 * Reloads the server by spawning a new Deno process with the specified entrypoint.
 *
 * This function logs a reload message, constructs a Deno command with appropriate
 * flags and arguments, spawns the new process, and then exits the current process.
 *
 * @param entrypoint - Optional path to the script entrypoint. Defaults to "httpath.ts" if not provided.
 * @returns void
 *
 * @example
 * ```typescript
 * reloadServer();
 * // or with custom entrypoint
 * reloadServer("./custom-entry.ts");
 * ```
 */
export const reloadServer = (entrypoint?: string): void => {
  log("Reloading server...");

  const script = entrypoint ?? "httpath.ts";

  const command = new Deno.Command(Deno.execPath(), {
    args: [
      "run",
      "-NR",
      "--allow-run",
      "--allow-env",
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

/**
 * Starts a file system watcher that monitors changes in the configured directory.
 *
 * Handles file change events and determines whether to restart the server or trigger
 * browser reload based on the configuration and file types that changed.
 *
 * @param config - The configuration object containing watch directory, patterns, and reload settings
 * @param abortController - AbortController to signal when watching should stop
 * @param entrypoint - Optional path to the main entrypoint file for server restart
 *
 * @returns A promise that resolves when the watcher is started and runs until aborted
 *
 * @throws May throw errors from Deno.watchFs or file processing operations
 *
 * @remarks
 * - Debounces file change events to avoid processing rapid changes
 * - Differentiates between server restart triggers (config files) and browser reload triggers (frontend files)
 * - Skips duplicate events and ignored file patterns based on configuration
 * - Notifies live reload clients when `enableLiveReload` is configured
 * - Respects the `restartOnChange` flag to determine legacy vs. smart reload behavior
 *
 * @example
 * ```typescript
 * const controller = new AbortController();
 * await startFileWatcher(config, controller, './app.ts');
 * // Watcher runs indefinitely until controller.abort() is called
 * ```
 */
export const startFileWatcher = async (
  config: Config,
  abortController: AbortController,
  entrypoint?: string,
): Promise<void> => {
  const watcher = Deno.watchFs(config.directory);
  const debounceChange = createDebouncer();

  log(`Watching for file changes in: ${config.directory}`);
  if (config.restartOnChange) {
    log("Mode: Server restart on file changes");
  } else {
    log("Mode: Browser reload on file changes (server stays alive)");
  }

  try {
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
        await debounceChange(500);
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

          // Short-circuit: only evaluate browser reload when restart is not needed
          const shouldReload = shouldRestart
            ? false
            : shouldTriggerBrowserReload(event.paths);

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
        // Reset immediately after processing completes, not via a fixed timer,
        // to prevent the race where a 1 s timeout fires before the current
        // debounce+work cycle has actually finished.
        isProcessingChange = false;
      }
    }
  } catch (error) {
    if (!abortController.signal.aborted) {
      log(`Watcher error: ${(error as Error).message}`, "error");
    }
  } finally {
    watcher.close();
  }
};
