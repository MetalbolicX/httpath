import type { Config } from "../types.mts";

const LEVELS: Record<string, number> = { debug: 0, info: 1, error: 2 };
let currentLevel: Config["logLevel"] = "info";

/**
 * Sets the minimum log level.
 * @param level - The log level to set.
 */
export const setLogLevel = (level: Config["logLevel"]): void => {
  currentLevel = level;
};

/**
 * Logs a message with a timestamp and log level prefix.
 * @param message - The message to log.
 * @param level - The log level (default: "info").
 */
export const log = (
  message: string,
  level: Config["logLevel"] = "info",
): void => {
  if (LEVELS[level] < LEVELS[currentLevel]) return;
  const timestamp = new Date().toISOString();
  const prefix = level.toUpperCase().padEnd(5);
  console.log(`[${timestamp}] ${prefix} ${message}`);
};
