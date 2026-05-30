import { parseArgs } from "@std/cli";
import { resolve } from "@std/path";
import type { Config } from "../types.mts";

const LOOPBACK_HOSTNAMES = new Set(["127.0.0.1", "localhost", "::1"]);

export const getPublicHostWarning = (hostname: string): string | null => {
  const normalized = hostname.trim().toLowerCase();

  if (LOOPBACK_HOSTNAMES.has(normalized)) return null;

  return `Warning: binding to ${hostname} may expose httpath beyond localhost. Use 127.0.0.1 for localhost-only access.`;
};

export const DEFAULT_CONFIG: Config = {
  directory: Deno.cwd(),
  hostname: "127.0.0.1",
  port: 8080,
  ignorePatterns: [".git", "node_modules", ".DS_Store"],
  enableDirectoryListing: false,
  logLevel: "info",
  enableLiveReload: true,
  restartOnChange: false,
  trustProxy: false,
  allowProtectedDir: false,
};

/**
 * Parses command-line arguments and returns a validated configuration object.
 *
 * Supports the following options:
 * - `--dir, -d`: Directory to serve (default: current directory)
 * - `--host`: Hostname to bind to (default: 127.0.0.1)
 * - `--port, -p`: Port to listen on (default: 8080)
 * - `--ignore, -i`: Comma-separated patterns to ignore
 * - `--no-listing`: Disable directory listing
 * - `--no-live-reload`: Disable live reload feature
 * - `--restart-on-change, -r`: Restart server on file changes
 * - `--log`: Log level (info, debug, error)
 * - `--help, -h`: Display help message and exit
 *
 * @param args - Array of command-line arguments to parse
 * @returns A validated {@link Config} object with parsed settings
 * @throws {Error} If the port number is invalid (not between 1 and 65535)
 *
 * @example
 * ```ts
 * const config = parseArguments(['--dir', './public', '--port', '3000']);
 * console.log(config.directory); // /absolute/path/to/public
 * console.log(config.port); // 3000
 * ```
 */
export const parseArguments = (args: string[]): Config => {
  const parsed = parseArgs(args, {
    string: ["dir", "host", "port", "ignore", "log"],
    boolean: [
      "listing",
      "no-listing",
      "help",
      "no-live-reload",
      "restart-on-change",
      "allow-protected-dir",
      "trust-proxy",
    ],
    default: {
      dir: DEFAULT_CONFIG.directory,
      host: DEFAULT_CONFIG.hostname,
      port: DEFAULT_CONFIG.port.toString(),
      ignore: DEFAULT_CONFIG.ignorePatterns.join(","),
      log: DEFAULT_CONFIG.logLevel,
      listing: false,
      "no-listing": false,
      "no-live-reload": false,
      "restart-on-change": false,
      "allow-protected-dir": false,
      "trust-proxy": false,
    },
    alias: {
      d: "dir",
      p: "port",
      i: "ignore",
      h: "help",
      r: "restart-on-change",
    },
  });

  if (parsed.help) {
    console.log(`
Static File Server with Auto-Reload

Usage: httpath [OPTIONS]

Options:
  -d, --dir <directory>     Directory to serve (default: current directory)
  --host <hostname>         Hostname to bind to (default: 127.0.0.1)
  -p, --port <port>         Port to listen on (default: 8080)
  -i, --ignore <patterns>   Comma-separated patterns to ignore (default: .git,node_modules,.DS_Store)
  --listing               Enable directory listing
  --no-listing            Disable directory listing
  --no-live-reload         Disable live reload feature
   -r, --restart-on-change      Restart server process on file changes (default: browser reload only)
   --trust-proxy             Trust proxy forwarding headers for client identity (default: false)
   --log <level>            Log level: info, debug, error (default: info)
   --allow-protected-dir    Allow serving a known system/OS directory (use with caution)
  -h, --help               Show this help message

Examples:
  httpath                                      # Smart mode: browser reload for HTML/CSS/JS, server restart for config
  httpath --dir ./public --port 3000          # Serve from ./public on port 3000
  httpath --restart-on-change                 # Legacy mode: always restart server on any file change
  httpath --no-live-reload                    # Disable all live reload features
  httpath --ignore "*.log,temp*" --no-listing
`);
    Deno.exit(0);
  }

  const port = parseInt(parsed.port);
  if (isNaN(port) || port < 1 || port > 65535) {
    throw new Error("Port must be a valid number between 1 and 65535");
  }

  const validLogLevels: Config["logLevel"][] = ["info", "debug", "error"];
  if (!validLogLevels.includes(parsed.log as Config["logLevel"])) {
    throw new Error(
      `Invalid log level: "${parsed.log}". Must be one of: ${
        validLogLevels.join(", ")
      }`,
    );
  }

  return {
    directory: resolve(parsed.dir),
    hostname: parsed.host,
    port,
    ignorePatterns: parsed.ignore.split(",").map((pattern) => pattern.trim()),
    enableDirectoryListing: parsed.listing && !parsed["no-listing"],
    logLevel: parsed.log as Config["logLevel"],
    enableLiveReload: !parsed["no-live-reload"],
    restartOnChange: parsed["restart-on-change"],
    trustProxy: parsed["trust-proxy"],
    allowProtectedDir: parsed["allow-protected-dir"],
  };
};
