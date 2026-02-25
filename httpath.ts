#!/usr/bin/env -S deno run -RN --allow-run --sloppy-imports
import { parseArguments } from "./src/cli";
import { log } from "./src/utils";
import { startHttpServer } from "./src/server";
import { startFileWatcher } from "./src/watcher";

/**
 * Sets up signal handlers for graceful shutdown.
 * @param abortController - The AbortController used for graceful shutdown.
 */
export const setupSignalHandlers = (abortController: AbortController): void => {
    const signals = ["SIGINT", "SIGTERM"] as const;

    signals.forEach((signal) => {
        Deno.addSignalListener(signal, () => {
            log(`Received ${signal}, shutting down gracefully...`);
            abortController.abort();
            Deno.exit(0);
        });
    });
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
