#!/usr/bin/env -S deno run -RN --allow-run --sloppy-imports
import { parseArguments } from "./src/cli/index.ts";
import { log, setLogLevel } from "./src/utils/index.ts";
import { startHttpServer } from "./src/server/index.ts";
import { startFileWatcher } from "./src/watcher/index.ts";

/**
 * Sets up signal handlers for graceful shutdown of the application.
 *
 * Attempts to register listeners for SIGINT and SIGTERM signals. When either signal is received,
 * the application will log the shutdown message, abort the provided AbortController, and exit gracefully.
 *
 * On platforms where a signal is not supported (such as SIGTERM on Windows), the registration will fail
 * silently and a debug-level log message will be emitted instead of throwing an error.
 *
 * @param abortController - The AbortController instance to abort when a shutdown signal is received.
 *                          This allows coordinated cancellation of ongoing operations.
 *
 * @returns void
 */
const setupSignalHandlers = (abortController: AbortController): void => {
  // We attempt to listen to both, but we won't crash if one fails
  const signals = ["SIGINT", "SIGTERM"] as const;

  for (const signal of signals) {
    try {
      Deno.addSignalListener(signal, () => {
        log(`Received ${signal}, shutting down gracefully...`);
        abortController.abort();
        Deno.exit(0);
      });
    } catch (_error) {
      // On Windows, SIGTERM will throw "TypeError: Signal not supported"
      // We log this as debug so it doesn't clutter the user's output
      // but developers can still see why a signal wasn't registered.
      log(
        `Signal listener for ${signal} could not be registered (OS restriction).`,
        "debug",
      );
    }
  }
};

/**
 * Main entry point for the httpath application.
 *
 * Initializes the application by:
 * - Parsing command-line arguments
 * - Setting the log level
 * - Validating the target directory exists and is a directory
 * - Setting up signal handlers for graceful shutdown
 * - Starting both the file watcher and HTTP server concurrently
 *
 * @returns A promise that resolves when the application completes or rejects on error
 * @throws Will exit the process with code 1 if any error occurs during initialization or execution
 */
export const main = async (): Promise<void> => {
  try {
    const config = parseArguments(Deno.args);
    setLogLevel(config.logLevel);

    try {
      const dirInfo = await Deno.stat(config.directory);
      if (!dirInfo.isDirectory) {
        throw new Error(`${config.directory} is not a directory`);
      }
    } catch (error) {
      if (error instanceof Deno.errors.NotFound) {
        throw new Error(`Directory not found: ${config.directory}`);
      }
      throw error;
    }

    const abortController = new AbortController();
    setupSignalHandlers(abortController);

    const entrypoint = new URL(import.meta.url).pathname;

    await Promise.race([
      startFileWatcher(config, abortController, entrypoint),
      startHttpServer(config, abortController),
    ]);
  } catch (error) {
    log(`Error: ${(error as Error).message}`, "error");
    Deno.exit(1);
  }
};

if (import.meta.main) {
  await main();
}
