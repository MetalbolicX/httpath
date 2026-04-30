import type { Config } from "../types.mts";

const LEVELS: Record<string, number> = { debug: 0, info: 1, error: 2 };
let currentLevel: Config["logLevel"] = "info";


/**
 * Sets the current logging level for the logger.
 * @param level - The logging level to set, as defined in the Config type
 */
export const setLogLevel = (level: Config["logLevel"]): void => {
  currentLevel = level;
};

/**
 * Logs a message to the console with a specified log level and timestamp.
 *
 * @param message - The message to log.
 * @param level - The log level for this message. Defaults to "info".
 *                Only logs if the level is greater than or equal to the current log level.
 * @returns void
 *
 * @example
 * ```typescript
 * log("Application started");
 * log("An error occurred", "error");
 * log("Debug information", "debug");
 * ```
 */
export const log = (
  message: string,
  level: Config["logLevel"] = "info",
): void => {
  if (LEVELS[level] < LEVELS[currentLevel]) return;
  // Allocate the timestamp only after the level check passes
  const timestamp = new Date().toISOString();
  const prefix = level.toUpperCase().padEnd(5);
  console.log(`[${timestamp}] ${prefix} ${message}`);
};
