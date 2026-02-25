import type { Config } from "../types.mts";

/**
 * Logs a message with a timestamp and log level prefix.
 * @param message - The message to log.
 * @param level - The log level (default: "info").
 */
export const log = (
    message: string,
    level: Config["logLevel"] = "info",
): void => {
    const timestamp = new Date().toISOString();
    const prefix = level.toUpperCase().padEnd(5);
    console.log(`[${timestamp}] ${prefix} ${message}`);
};
