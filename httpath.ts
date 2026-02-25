#!/usr/bin/env -S deno run -RN --allow-run --sloppy-imports
import { parseArguments } from "./src/cli";
import { log } from "./src/utils";
import { startHttpServer } from "./src/server";
import { startFileWatcher } from "./src/watcher";

/**
 * Sets up signal handlers for graceful shutdown.
 * Uses a try-catch block to handle OS-specific signal support
 * (e.g., Windows does not support SIGTERM).
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
    } catch (error) {
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

export const main = async (): Promise<void> => {
  try {
    const config = parseArguments(Deno.args);

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

    await Promise.race([
      startFileWatcher(config, abortController),
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
