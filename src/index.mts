#!/usr/bin/env node
/* eslint-disable @typescript-eslint/no-unused-vars */
/* Converted from sample.mjs to TypeScript */

import { parseArgs, ParseArgsConfig } from "node:util";
import { join, resolve, extname, dirname } from "node:path";
import { createServer, IncomingMessage, ServerResponse } from "node:http";
import { watch, createReadStream } from "node:fs";
import { stat, readdir, open } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";

// --- Types ---

export interface Config {
  directory: string;
  port: number;
  ignorePatterns: string[];
  enableDirectoryListing: boolean;
  logLevel: ParseArgsConfig["logLevel"];
  enableLiveReload: boolean;
  restartOnChange: boolean;
}

export interface FileEntry {
  name: string;
  isDirectory: boolean;
  url: string;
}

// --- Constants & Globals ---

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const MIME_TYPES: Record<string, string> = {
  html: "text/html",
  css: "text/css",
  js: "text/javascript",
  mjs: "text/javascript",
  json: "application/json",
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  svg: "image/svg+xml",
  ico: "image/x-icon",
  txt: "text/plain",
  md: "text/markdown",
  ts: "video/mp2t", // Common misinterpretation, but for serving source:
  // For source code serving usually text/plain is safer unless specific mime needed
};

const DEFAULT_CONFIG: Config = {
  directory: __dirname,
  port: 8080,
  ignorePatterns: [".git", "node_modules", ".DS_Store"],
  enableDirectoryListing: true,
  logLevel: "info",
  enableLiveReload: true,
  restartOnChange: false,
};

let debounceTimeout: ReturnType<typeof setTimeout> | null = null;
let isProcessingChange = false;
const liveReloadClients = new Set<ServerResponse>();

// --- Helpers ---

/**
 * Parses command line arguments.
 * @param args string[]
 */
const parseArguments = (args: string[]): Config => {
  const options: ParseArgsConfig = {
    dir: { type: "string", short: "d", default: DEFAULT_CONFIG.directory },
    port: {
      type: "string",
      short: "p",
      default: DEFAULT_CONFIG.port.toString(),
    },
    ignore: {
      type: "string",
      short: "i",
      default: DEFAULT_CONFIG.ignorePatterns.join(","),
    },
    "no-listing": { type: "boolean", default: false },
    "no-live-reload": { type: "boolean", default: false },
    "restart-on-change": { type: "boolean", default: false },
    log: { type: "string", default: DEFAULT_CONFIG.logLevel },
    help: { type: "boolean", short: "h", default: false },
  };

  const { values } = parseArgs({ args, options, allowPositionals: true });

  if (values.help) {
    console.log(`
Static File Server with Auto-Reload (Node.js)

Usage: httpreload [OPTIONS]

Options:
  -d, --dir <directory>      Directory to serve (default: current directory)
  -p, --port <port>          Port to listen on (default: 8080)
  -i, --ignore <patterns>    Comma-separated patterns to ignore
  --no-listing               Disable directory listing
  --no-live-reload           Disable live reload feature
  --restart-on-change        Restart server process on file changes
  --log <level>              Log level: info, debug, error
  -h, --help                 Show this help message
`);
    process.exit(0);
  }

  const port = parseInt((values.port as string) || "8080", 10);
  if (isNaN(port) || port < 1 || port > 65535) {
    throw new Error("Port must be a valid number between 1 and 65535");
  }

  return {
    directory: resolve((values.dir as string) || "."),
    port,
    ignorePatterns: ((values.ignore as string) || "")
      .split(",")
      .map((p) => p.trim())
      .filter(Boolean),
    enableDirectoryListing: !Boolean(values["no-listing"]),
    logLevel:
      (values.log as ParseArgsConfig["logLevel"]) || DEFAULT_CONFIG.logLevel,
    enableLiveReload: !Boolean(values["no-live-reload"]),
    restartOnChange: Boolean(values["restart-on-change"]),
  };
};

/**
 * Logs a message.
 * @param message string
 * @param level Config['logLevel']
 */
const log = (message: string, level: Config["logLevel"] = "info") => {
  const timestamp = new Date().toISOString();
  const prefix = level.toUpperCase().padEnd(5);
  // eslint-disable-next-line no-console
  console.log(`[${timestamp}] ${prefix} ${message}`);
};

/**
 * Checks if a filename should be ignored.
 * @param filename string
 * @param ignorePatterns string[]
 */
const shouldIgnore = (filename: string, ignorePatterns: string[]) =>
  ignorePatterns.some(
    (pattern) => filename.includes(pattern) || filename.endsWith(pattern),
  );

/**
 * Debounce helper.
 * @param ms number
 */
const debounce = (ms: number) =>
  new Promise<void>((resolve) => {
    if (debounceTimeout) clearTimeout(debounceTimeout);
    debounceTimeout = setTimeout(() => {
      debounceTimeout = null;
      resolve();
    }, ms);
  });

/**
 * Gets MIME type from file extension.
 * @param filePath string
 */
const getMimeType = (filePath: string) => {
  const ext = extname(filePath).slice(1).toLowerCase();
  return MIME_TYPES[ext] || "application/octet-stream";
};

// --- Live Reload (SSE) ---

/**
 * Generates the SSE client script.
 * @param port number
 */
const getLiveReloadScript = (port: number) => /*html*/ `
<script>
(() => {
  const sseUrl = '/livereload';
  let source;

  const connect = () => {
    console.log('[Live Reload] Connecting...');
    source = new EventSource(sseUrl);

    source.onopen = () => {
      console.log('[Live Reload] Connected');
    };

    source.onmessage = (event) => {
      if (event.data === 'reload') {
        console.log('[Live Reload] Reloading page...');
        window.location.reload();
      }
    };

    source.onerror = () => {
      console.log('[Live Reload] Connection error, reconnecting...');
      source.close();
      setTimeout(connect, 1000);
    };
  };

  connect();
})();
</script>`;

/**
 * Injects script into HTML.
 * @param html string
 * @param port number
 */
const injectLiveReloadScript = (html: string, port: number) => {
  const script = getLiveReloadScript(port);
  if (html.includes("</body>")) {
    return html.replace("</body>", `${script}\n</body>`);
  } else if (html.includes("</html>")) {
    return html.replace("</html>", `${script}\n</html>`);
  }
  return html + script;
};

/**
 * Handles SSE subscriptions.
 * @param req IncomingMessage
 * @param res ServerResponse
 */
const handleSSE = (req: IncomingMessage, res: ServerResponse) => {
  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
  });

  res.write("data: connected\n\n");
  liveReloadClients.add(res);

  req.on("close", () => {
    liveReloadClients.delete(res);
  });
};

/**
 * Notifies all connected clients to reload.
 * @param reason string
 */
const notifyClients = (reason = "change") => {
  if (liveReloadClients.size === 0) return;
  log(`Reloading ${liveReloadClients.size} clients (${reason})`, "debug");
  for (const client of liveReloadClients) {
    try {
      client.write(`data: reload\n\n`);
    } catch {
      // ignore write errors for individual clients
    }
  }
};

// --- HTML Generators ---

const getCSSStyles = () => /*css*/ `
:root { --bg-page: #f2f2f2; --bg-article: #bbc3db; --color-title: #333; --color-paragraph: #333; --link-color: #1a0dab; --link-hover-color: #d93025; --toggle-color: #0f172b; --fill-icons: white; }
:root:has(#dark:checked) { --bg-page: #333; --bg-article: #444; --color-title: #eee; --color-paragraph: #ddd; --link-color: #bb86fc; --link-hover-color: #ff79c6; }
body { font-family: monospace; font-size: 1.3em; margin: 0.5em; padding: 1em; background-color: var(--bg-page); color: var(--color-paragraph); &:has(#dark:checked) { background-color: var(--bg-article); color: var(--color-title); } }
h1 { font-size: 2em; margin-bottom: 0.5em; }
a { text-decoration: none; color: var(--link-color); &:hover { text-decoration: underline; color: var(--link-hover-color); } }
.toggle { --width: 3em; --height: calc(var(--width) / 2); --border-radius: calc(var(--height) / 2); display: inline-block; cursor: pointer; .toggle__input { display: none; &:checked + .toggle__fill { background: #009578; } &:checked + .toggle__fill::after { transform: translateX(var(--height)); } } .toggle__fill { position: relative; width: var(--width); height: var(--height); border-radius: var(--border-radius); background-color: var(--toggle-color); transition: background-color 0.3s ease-in-out; &::after { content: ""; position: absolute; top: 0; left: 0; width: var(--height); height: var(--height); border-radius: var(--border-radius); background-color: var(--fill-icons); box-shadow: 0 0 0.2em rgba(0, 0, 0, 0.2); transition: transform 0.3s ease-in-out; } } }
:root {
  --bg-page: #f6f8fb;
  --bg-panel: #ffffff;
  --muted: #6b7280;
  --title: #0f172a;
  --link-color: #2563eb;
  --link-hover-color: #1e40af;
  --accent: #10b981;
  --card-shadow: 0 6px 18px rgba(15, 23, 42, 0.06);
  --radius: 10px;
  --gap: 12px;
  --toggle-track: #e6e9ee;
  --toggle-knob: #ffffff;
}

:root:has(#dark:checked) {
  --bg-page: #0b1220;
  --bg-panel: #0f1724;
  --muted: #9ca3af;
  --title: #e6eef8;
  --link-color: #7c9cff;
  --link-hover-color: #9fb7ff;
  --accent: #34d399;
  --card-shadow: 0 6px 18px rgba(2,6,23,0.6);
  --toggle-track: #1f2937;
  --toggle-knob: #0b1220;
}

* { box-sizing: border-box; }

body {
  margin: 0;
  padding: 2rem;
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, "Noto Sans", "Liberation Sans", sans-serif;
  background-color: var(--bg-page);
  color: var(--title);
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
  line-height: 1.4;
  display: flex;
  justify-content: center;
  align-items: flex-start;
  min-height: 100vh;
}

.container {
  width: 100%;
  max-width: 980px;
  background: linear-gradient(180deg, rgba(255,255,255,0.6), rgba(255,255,255,0.4));
  background-color: var(--bg-panel);
  border-radius: var(--radius);
  box-shadow: var(--card-shadow);
  padding: 1.25rem;
  gap: var(--gap);
}

/* Header */
.header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  margin-bottom: 0.75rem;
}
.header .title {
  font-size: 1.6rem;
  font-weight: 600;
}
.header .subtitle {
  color: var(--muted);
  font-size: 0.95rem;
}

/* Dark toggle */
.toggle {
  --width: 48px;
  --height: 24px;
  display: inline-flex;
  align-items: center;
  cursor: pointer;
}
.toggle__input {
  position: absolute;
  opacity: 0;
  pointer-events: none;
}
.toggle__fill {
  width: var(--width);
  height: var(--height);
  background: var(--toggle-track);
  border-radius: 999px;
  position: relative;
  transition: background 200ms ease;
}
.toggle__fill::after {
  content: "";
  position: absolute;
  top: 3px;
  left: 3px;
  width: calc(var(--height) - 6px);
  height: calc(var(--height) - 6px);
  border-radius: 50%;
  background: var(--toggle-knob);
  box-shadow: 0 2px 6px rgba(2,6,23,0.08);
  transition: transform 200ms ease;
}
.toggle__input:checked + .toggle__fill {
  background: linear-gradient(90deg, rgba(16,185,129,0.9), rgba(34,197,94,0.9));
}
.toggle__input:checked + .toggle__fill::after {
  transform: translateX(calc(var(--width) - var(--height)));
}

/* Listing - improved file/folder presentation */
.listing {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  margin-top: 0.5rem;
  width: 100%;
}

/* Each item becomes a clear row with icon, name, and meta */
.listing a.item {
  display: grid;
  grid-template-columns: 44px 1fr auto;
  align-items: center;
  gap: 0.75rem;
  padding: 0.75rem 1rem;
  border-radius: 10px;
  color: var(--title);
  text-decoration: none;
  background: transparent;
  transition: background 180ms ease, transform 150ms ease, box-shadow 180ms ease;
  font-size: 1rem;
  overflow: hidden;
  border: 1px solid transparent;
}

/* Hover and focus styles */
.listing a.item:hover,
.listing a.item:focus {
  background: color-mix(in srgb, var(--link-hover-color) 6%, transparent);
  transform: translateY(-4px);
  box-shadow: 0 10px 24px color-mix(in srgb, var(--title) 6%, transparent);
  color: var(--link-hover-color);
  outline: none;
  border-color: color-mix(in srgb, var(--link-hover-color) 12%, transparent);
}

/* Icon badge */
.listing a.item .icon {
  display: inline-grid;
  place-items: center;
  width: 44px;
  height: 44px;
  border-radius: 10px;
  font-size: 1.1rem;
  flex: 0 0 auto;
  background: linear-gradient(180deg, rgba(255,255,255,0.03), rgba(0,0,0,0.02));
  box-shadow: 0 2px 8px rgba(2,6,23,0.04);
  color: var(--fill-icons, #fff);
}

/* Different tones for directories vs files - still respecting variables */
.listing a.item.dir .icon {
  background: linear-gradient(180deg, rgba(124,58,237,0.12), rgba(124,58,237,0.06));
  color: white;
}
.listing a.item.file .icon {
  background: linear-gradient(180deg, rgba(37,99,235,0.08), rgba(37,99,235,0.03));
  color: white;
}

/* Name column */
.listing a.item .name {
  font-weight: 600;
  color: var(--title);
  min-width: 0; /* allow ellipsis */
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* Meta column (size/type/date or just type for now) */
.listing a.item .meta {
  color: var(--muted);
  font-size: 0.82rem;
  margin-left: 0.6rem;
  text-align: right;
  white-space: nowrap;
  flex-shrink: 0;
  background: color-mix(in srgb, var(--muted) 8%, transparent);
  padding: 4px 8px;
  border-radius: 999px;
}

/* Parent link styling - present as subtle pill */
.parent {
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.35rem 0.6rem;
  border-radius: 8px;
  margin-bottom: 0.35rem;
  color: var(--muted);
  font-size: 0.95rem;
  background: transparent;
}
.parent a { color: inherit; text-decoration: none; }

/* Small screens adjustments */
@media (max-width: 640px) {
  .container { padding: 0.8rem; margin: 1rem; }
  .header .title { font-size: 1.25rem; }
  .listing a.item { padding: 0.5rem; font-size: 0.95rem; grid-template-columns: 36px 1fr auto; }
  .listing a.item .icon { width: 36px; height: 36px; border-radius: 8px; }
}
`;

/**
 * Generates Directory Listing HTML.
 * @param entries FileEntry[]
 * @param urlPath string
 */
const generateDirectoryListingHTML = (
  entries: FileEntry[],
  urlPath: string,
) => {
  const parentDir =
    urlPath === "/" ? "" : `<div class="parent"><a href="../">../</a></div>`;
  const entryLinks = entries
    .slice()
    .sort((a, b) =>
      a.isDirectory === b.isDirectory ? 0 : a.isDirectory ? -1 : 1,
    )
    .sort((a, b) =>
      a.isDirectory === b.isDirectory ? a.name.localeCompare(b.name) : 0,
    )
    .map((entry) => {
      const icon = entry.isDirectory ? "📁" : "📄";
      const href = entry.url;
      const kindClass = entry.isDirectory ? "dir" : "file";
      const meta = entry.isDirectory
        ? "Directory"
        : entry.name.includes(".")
          ? entry.name.split(".").pop().toUpperCase()
          : "File";
      return `<a class="item ${kindClass}" href="${href}"><span class="icon">${icon}</span><span class="name">${entry.name}</span><span class="meta">${meta}</span></a>`;
    })
    .join("\n");

  return /*html*/ `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Listing of ${urlPath}</title>
  <style>${getCSSStyles()}</style>
</head>
<body>
  <label class="toggle" for="dark"><input type="checkbox" id="dark" class="toggle__input" checked><span class="toggle__fill"></span></label>
  <h1>Listing of ${urlPath}</h1>
  <div class="listing">
    ${parentDir}
    ${entryLinks}
  </div>
</body>
</html>`;
};

// --- Server Logic ---

/**
 * Serves a file.
 * @param filePath string
 * @param res ServerResponse
 * @param config Config
 */
const serveFile = async (
  filePath: string,
  res: ServerResponse,
  config: Config,
) => {
  const mimeType = getMimeType(filePath);

  // Inject script for HTML files if live reload is on
  if (config.enableLiveReload && mimeType.includes("text/html")) {
    try {
      const handle = await open(filePath);
      try {
        const content = await handle.readFile({ encoding: "utf-8" });
        const modified = injectLiveReloadScript(content, config.port);
        res.writeHead(200, { "Content-Type": mimeType });
        res.end(modified);
        return;
      } finally {
        await handle.close();
      }
    } catch (e) {
      // Fallback to stream on error
    }
  }

  res.writeHead(200, { "Content-Type": mimeType });
  const stream = createReadStream(filePath);
  stream.pipe(res);
  stream.on("error", (err) => {
    res.writeHead(500);
    res.end(err.message);
  });
};

/**
 * Serves a directory.
 * @param dirPath string
 * @param urlPath string
 * @param res ServerResponse
 * @param config Config
 */
const serveDirectory = async (
  dirPath: string,
  urlPath: string,
  res: ServerResponse,
  config: Config,
) => {
  try {
    const files = await readdir(dirPath, { withFileTypes: true });
    const entries: FileEntry[] = files
      .filter((f) => !shouldIgnore(f.name, config.ignorePatterns))
      .map((f) => ({
        name: f.name,
        isDirectory: f.isDirectory(),
        // Ensure URL paths use forward slashes
        url: join(urlPath, f.name).replace(/\\/g, "/"),
      }));

    let html = generateDirectoryListingHTML(entries, urlPath);
    if (config.enableLiveReload)
      html = injectLiveReloadScript(html, config.port);

    res.writeHead(200, { "Content-Type": "text/html" });
    res.end(html);
  } catch (e: any) {
    res.writeHead(500);
    res.end("Error reading directory");
  }
};

/**
 * Creates the HTTP request handler.
 * @param config Config
 * @returns import('node:http').RequestListener
 */
const createHandler = (config: Config) => {
  return async (req: IncomingMessage, res: ServerResponse) => {
    const hostHeader = req.headers.host || `localhost:${config.port}`;
    const url = new URL(req.url || "/", `http://${hostHeader}`);
    const pathname = decodeURIComponent(url.pathname);

    if (config.enableLiveReload && pathname === "/livereload") {
      return handleSSE(req, res);
    }

    // Security: Traversal prevention
    const safePath = resolve(config.directory, `.${pathname}`);
    if (!safePath.startsWith(config.directory)) {
      res.writeHead(403);
      return res.end("Forbidden");
    }

    try {
      const stats = await stat(safePath);
      if (stats.isFile()) {
        return await serveFile(safePath, res, config);
      } else if (stats.isDirectory()) {
        if (config.enableDirectoryListing) {
          return await serveDirectory(safePath, pathname, res, config);
        } else {
          // Try index.html
          const indexPath = join(safePath, "index.html");
          try {
            await stat(indexPath);
            return await serveFile(indexPath, res, config);
          } catch {
            res.writeHead(403);
            return res.end("Listing disabled");
          }
        }
      } else {
        res.writeHead(404);
        return res.end("Not Found");
      }
    } catch (e: any) {
      if (e && e.code === "ENOENT") {
        res.writeHead(404);
        return res.end("Not Found");
      }
      res.writeHead(500);
      res.end(e?.message || "Server error");
    }
  };
};

// --- Watcher & Main ---

/**
 * Restarts the server (spawns new process, exits current).
 */
const reloadServer = () => {
  log("Reloading server process...");
  const child = spawn(process.argv[0], process.argv.slice(1), {
    stdio: "inherit",
    detached: true,
  });
  // detach and let child continue
  // eslint-disable-next-line @typescript-eslint/no-floating-promises
  child.unref();
  process.exit(0);
};

/**
 * Starts watching files.
 * @param config Config
 */
const startWatcher = (config: Config) => {
  log(`Watching: ${config.directory}`);

  try {
    watch(
      config.directory,
      { recursive: true },
      async (eventType, filename) => {
        if (!filename || shouldIgnore(filename, config.ignorePatterns)) return;
        if (isProcessingChange) return;

        isProcessingChange = true;
        log(`Change detected: ${filename} (${eventType})`);

        await debounce(500);

        const isServerFile = /\.(json|js|mjs|ts)$/.test(filename);
        const isAsset = /\.(html|css|png|jpg|jpeg|gif|svg)$/.test(filename);

        if (config.restartOnChange || isServerFile) {
          if (config.enableLiveReload) notifyClients("restart");
          reloadServer();
        } else if (config.enableLiveReload && isAsset) {
          notifyClients("asset change");
        }

        // Reset lock
        setTimeout(() => {
          isProcessingChange = false;
        }, 1000);
      },
    );
  } catch (e: any) {
    log(`Watcher error: ${e?.message}`, "error");
  }
};

const main = () => {
  try {
    const config = parseArguments(process.argv.slice(2));
    const server = createServer(createHandler(config));

    server.listen(config.port, () => {
      log(`Server running at http://localhost:${config.port}`);
      log(`Root: ${config.directory}`);

      startWatcher(config);
    });

    // Graceful Shutdown
    (["SIGINT", "SIGTERM"] as NodeJS.Signals[]).forEach((sig) => {
      process.on(sig, () => {
        log("Shutting down...");
        process.exit(0);
      });
    });
  } catch (error: any) {
    log(`Startup Error: ${error?.message}`, "error");
    process.exit(1);
  }
};

main();
