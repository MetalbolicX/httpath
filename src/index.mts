#!/usr/bin/env node

// HTTPath - A minimalist Node.js file server with hot-reload capabilities
// Main entry point that orchestrates all modules

import { parseCliArgs, validateConfig, VERSION_INFO } from "./config/cli.mjs";
import { isSuccess, unwrap } from "./utils/result-pattern.mjs";
import { createHTTPServer } from "./services/server.mjs";
import { createLogger } from "./utils/logger.mjs";
import type { ServerInstance } from "./types/index.mjs";

/**
 * Global logger instance
 */
const logger = createLogger({
  level: "info",
  format: "simple",
  colorize: true,
});

/**
 * Application state
 */
let serverInstance: ServerInstance | null = null;

/**
 * Main application function
 */
const main = async (): Promise<void> => {
  // Display banner
  displayBanner();

  // Parse CLI arguments
  const configResult = parseCliArgs();
  if (!isSuccess(configResult)) {
    logger.error(
      "❌ Failed to parse CLI arguments:",
      configResult.error.message,
    );
    process.exit(1);
  }

  const config = configResult.data;

  // Validate configuration
  if (!validateConfig(config)) {
    process.exit(1);
  }

  // Create and start server
  try {
    const server = createHTTPServer(config);
    serverInstance = await server.start();

    // Setup graceful shutdown
    setupGracefulShutdown();
  } catch (error) {
    logger.error(
      "❌ Failed to start server:",
      error instanceof Error ? error.message : String(error),
    );
    process.exit(1);
  }
};

/**
 * Display application banner
 */
const displayBanner = (): void => {
  console.log(`
🚀 ${VERSION_INFO.name} v${VERSION_INFO.version}
${VERSION_INFO.description}
`);
};

/**
 * Setup graceful shutdown handlers
 */
const setupGracefulShutdown = (): void => {
  const signals: NodeJS.Signals[] = ["SIGINT", "SIGTERM"];

  for (const signal of signals) {
    process.on(signal, async () => {
      logger.info(`\n\n👋 Received ${signal}, shutting down gracefully...`);

      if (serverInstance) {
        try {
          await serverInstance.stop();
          logger.info("✅ Server stopped successfully");
          process.exit(0);
        } catch (error) {
          logger.error("❌ Error stopping server:", error);
          process.exit(1);
        }
      } else {
        process.exit(0);
      }
    });
  }

  // Handle uncaught exceptions
  process.on("uncaughtException", (error) => {
    logger.error("💥 Uncaught Exception:", error);
    if (serverInstance) {
      serverInstance.stop().finally(() => process.exit(1));
    } else {
      process.exit(1);
    }
  });

  // Handle unhandled promise rejections
  process.on("unhandledRejection", (reason, promise) => {
    logger.error("💥 Unhandled Promise Rejection:", reason);
    logger.debug("Promise:", promise);
    if (serverInstance) {
      serverInstance.stop().finally(() => process.exit(1));
    } else {
      process.exit(1);
    }
  });
};

/**
 * Check if this file is being run directly
 */
const isMainModule = (): boolean => {
  return (
    process.argv[1] &&
    (process.argv[1].endsWith("/index.mjs") ||
      process.argv[1].endsWith("\\index.mjs") ||
      process.argv[1].includes("dist"))
  );
};

// Run the application if this file is executed directly
if (isMainModule()) {
  main().catch((error) => {
    logger.error("💥 Application crashed:", error);
    process.exit(1);
  });
}

// Export main functions for programmatic use
export { main, createHTTPServer, parseCliArgs, validateConfig, VERSION_INFO };

// Re-export key types and utilities for external use
export type {
  ServerConfig,
  ServerInstance,
  HotReloadOptions,
  LoggerOptions,
} from "./types/index.mjs";

export { createLogger } from "./utils/logger.mjs";

export { findAvailablePort } from "./utils/port-finder.mjs";
export { createHotReloadService } from "./services/hot-reload.mjs";
