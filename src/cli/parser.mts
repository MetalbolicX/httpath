import { parseArgs } from "@std/cli";
import { resolve } from "@std/path";
import type { Config } from "../types.mts";

export const DEFAULT_CONFIG: Config = {
  directory: Deno.cwd(),
  port: 8080,
  ignorePatterns: [".git", "node_modules", ".DS_Store"],
  enableDirectoryListing: true,
  logLevel: "info",
  enableLiveReload: true,
  restartOnChange: false,
};

export const parseArguments = (args: string[]): Config => {
  const parsed = parseArgs(args, {
    string: ["dir", "port", "ignore", "log"],
    boolean: ["no-listing", "help", "no-live-reload", "restart-on-change"],
    default: {
      dir: DEFAULT_CONFIG.directory,
      port: DEFAULT_CONFIG.port.toString(),
      ignore: DEFAULT_CONFIG.ignorePatterns.join(","),
      log: DEFAULT_CONFIG.logLevel,
      "no-listing": false,
      "no-live-reload": false,
      "restart-on-change": false,
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
  -p, --port <port>         Port to listen on (default: 8080)
  -i, --ignore <patterns>   Comma-separated patterns to ignore (default: .git,node_modules,.DS_Store)
  --no-listing             Disable directory listing
  --no-live-reload         Disable live reload feature
  -r, --restart-on-change      Restart server process on file changes (default: browser reload only)
  --log <level>            Log level: info, debug, error (default: info)
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

  return {
    directory: resolve(parsed.dir),
    port,
    ignorePatterns: parsed.ignore.split(",").map((pattern) => pattern.trim()),
    enableDirectoryListing: !parsed["no-listing"],
    logLevel: parsed.log as Config["logLevel"],
    enableLiveReload: !parsed["no-live-reload"],
    restartOnChange: parsed["restart-on-change"],
  };
};
