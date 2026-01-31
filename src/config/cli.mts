// CLI argument parsing module
import { parseArgs } from "node:util";
import { resolve } from "node:path";
import type { ServerConfig, Result } from "../types/index.mjs";
import { tryCatch, mapToConfigurationError } from "../utils/result-pattern.mjs";

/**
 * Default configuration values
 */
export const DEFAULT_CONFIG = {
  port: 8080,
  rootPath: process.cwd(),
  reload: false,
} as const;

/**
 * CLI option definitions for parseArgs
 */
const CLI_OPTIONS = {
  port: {
    type: "string" as const,
    short: "p",
    default: DEFAULT_CONFIG.port.toString(),
  },
  path: {
    type: "string" as const,
    short: "d",
    default: DEFAULT_CONFIG.rootPath,
  },
  reload: {
    type: "boolean" as const,
    short: "r",
    default: DEFAULT_CONFIG.reload,
  },
  help: {
    type: "boolean" as const,
    short: "h",
    default: false,
  },
  version: {
    type: "boolean" as const,
    short: "v",
    default: false,
  },
} as const;

/**
 * Help text for the CLI
 */
export const HELP_TEXT = `
HTTPath - A minimalist Node.js file server with hot-reload capabilities

Usage: httpath [options]

Options:
  -p, --port <number>     Port number to listen on (default: 8080)
  -d, --path <directory>  Directory to serve files from (default: current directory)
  -r, --reload            Enable hot-reload functionality (default: false)
  -h, --help              Show this help message
  -v, --version           Show version number

Examples:
  httpath                           # Start server on port 8080 in current directory
  httpath --port 3000               # Start server on port 3000
  httpath --path ./public           # Serve files from ./public directory
  httpath --reload                  # Enable hot-reload for development
  httpath -p 3000 -d ./dist -r      # Combined options

Documentation: https://github.com/MetalbolicX/httpath
`;

/**
 * Version information
 */
export const VERSION_INFO = {
  name: "HTTPath",
  version: "0.1.0",
  description: "A minimalist Node.js file server with hot-reload capabilities",
  author: "José Martínez Santana",
  license: "MIT",
} as const;

/**
 * Parse command line arguments and return server configuration
 */
export const parseCliArgs = (
  argv: string[] = process.argv.slice(2),
): Result<ServerConfig> => {
  const parseResult = tryCatch(() => {
    const { values } = parseArgs({
      args: argv,
      options: CLI_OPTIONS,
      allowPositionals: true,
    });

    // Handle help flag
    if (values.help) {
      console.log(HELP_TEXT);
      process.exit(0);
    }

    // Handle version flag
    if (values.version) {
      console.log(`${VERSION_INFO.name} v${VERSION_INFO.version}`);
      console.log(VERSION_INFO.description);
      process.exit(0);
    }

    // Parse and validate port
    const port = parseInt(values.port as string, 10);
    if (isNaN(port) || port < 1 || port > 65535) {
      throw new Error(
        `Invalid port number: ${values.port}. Port must be between 1 and 65535.`,
      );
    }

    // Resolve and validate path
    const rootPath = resolve(values.path as string);

    return {
      port,
      rootPath,
      reload: Boolean(values.reload),
    };
  }, mapToConfigurationError);

  if (!parseResult.success) {
    console.error(`❌ Error parsing arguments: ${parseResult.error.message}`);
    console.log(HELP_TEXT);
    process.exit(1);
  }

  return parseResult;
};

/**
 * Validate server configuration
 */
export const validateConfig = (config: ServerConfig): boolean => {
  // Validate port
  if (
    !Number.isInteger(config.port) ||
    config.port < 1 ||
    config.port > 65535
  ) {
    console.error(
      `❌ Invalid port: ${config.port}. Port must be between 1 and 65535.`,
    );
    return false;
  }

  // Validate root path
  if (typeof config.rootPath !== "string" || config.rootPath.length === 0) {
    console.error(`❌ Invalid root path: ${config.rootPath}`);
    return false;
  }

  // Validate reload flag
  if (typeof config.reload !== "boolean") {
    console.error(`❌ Invalid reload flag: ${config.reload}. Must be boolean.`);
    return false;
  }

  return true;
};

/**
 * Display configuration summary
 */
export const displayConfig = (config: ServerConfig): void =>
  console.log(`📋 Server Configuration:
  Port: ${config.port}
  Root Path: ${config.rootPath}
  Hot-reload: ${config.reload ? "Enabled" : "Disabled"}`);

/**
 * Create configuration from environment variables
 */
export const parseEnvConfig = (): Result<Partial<ServerConfig>> => {
  return tryCatch(() => {
    const config: Partial<ServerConfig> = {};

    // Parse port from environment
    if (process.env.PORT) {
      const port = parseInt(process.env.PORT, 10);
      if (!isNaN(port)) {
        config.port = port;
      }
    }

    // Parse path from environment
    if (process.env.HTTPATH_ROOT) {
      config.rootPath = resolve(process.env.HTTPATH_ROOT);
    }

    // Parse reload from environment
    if (process.env.HTTPATH_RELOAD) {
      config.reload = process.env.HTTPATH_RELOAD.toLowerCase() === "true";
    }

    return config;
  }, mapToConfigurationError);
};

/**
 * Merge configurations with priority: CLI > ENV > Default
 */
export const mergeConfigs = (
  cliConfig: ServerConfig,
  envConfigResult?: Result<Partial<ServerConfig>>,
): Result<ServerConfig> => {
  return tryCatch(() => {
    const envConfig =
      envConfigResult && envConfigResult.success ? envConfigResult.data : {};

    return {
      ...DEFAULT_CONFIG,
      ...envConfig,
      ...cliConfig,
    };
  }, mapToConfigurationError);
};
