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
 * @param args {string[]} - Command line arguments.
 * @returns {Config} - Parsed configuration.
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
    "restart-on-change": { type: "boolean", short: "r", default: false },
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
  -r  --restart-on-change        Restart server process on file changes
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
 * @param message {string} - The message to log.
 * @param level {Config['logLevel']} - The log level.
 */
const log = (message: string, level: Config["logLevel"] = "info") => {
  const timestamp = new Date().toISOString();
  const prefix = level.toUpperCase().padEnd(5);
  // eslint-disable-next-line no-console
  console.log(`[${timestamp}] ${prefix} ${message}`);
};

/**
 * Checks if a filename should be ignored.
 * @param filename {string} - The filename to check.
 * @param ignorePatterns {string[]} - The patterns to ignore.
 */
const shouldIgnore = (filename: string, ignorePatterns: string[]) =>
  ignorePatterns.some(
    (pattern) => filename.includes(pattern) || filename.endsWith(pattern),
  );

/**
 * Debounce helper.
 * @param ms {number} - The debounce time in milliseconds.
 * @returns {Promise<void>} - A promise that resolves after the debounce time.
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
 * @param filePath {string} - The file path to get the MIME type for.
 */
const getMimeType = (filePath: string) => {
  const ext = extname(filePath).slice(1).toLowerCase();
  return MIME_TYPES[ext] || "application/octet-stream";
};

// --- Live Reload (SSE) ---

/**
 * Generates the SSE client script.
 * @param port {number} - The port number for the SSE server.
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
 * @param html {string} - The HTML content to inject the script into.
 * @param port {number} - The port number for the SSE server.
 * @returns {string} - The HTML content with the script injected.
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
 * @param req IncomingMessage - The incoming HTTP request.
 * @param res ServerResponse - The server response.
 * @returns {Promise<void>} - A promise that resolves after the SSE subscription is handled.
 */
const handleSSE = async (req: IncomingMessage, res: ServerResponse) => {
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
 * @param reason {string} - The reason for the reload notification.
 * @returns {Promise<void>} - A promise that resolves after all clients are notified.
 */
const notifyClients = async (reason = "change") => {
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
:root{--bg:#f6f8fa;--card:#ffffff;--muted:#6b7280;--accent:#2563eb;--accent-2:#1f2937}
*{box-sizing:border-box}
body{margin:0;font-family:Inter,ui-sans-serif,system-ui,-apple-system,Segoe UI,Roboto,'Helvetica Neue',Arial;font-size:14px;background:var(--bg);color:var(--accent-2);}
.container{max-width:980px;margin:28px auto;padding:20px}
.card{background:var(--card);border-radius:10px;padding:18px;box-shadow:0 6px 18px rgba(15,23,42,0.06)}
.header{display:flex;align-items:center;justify-content:space-between;margin-bottom:12px}
.title{font-size:18px;font-weight:600;color:var(--accent-2);margin:0}
.path{font-size:12px;color:var(--muted)}
.file-list{list-style:none;padding:0;margin:0;display:grid;grid-template-columns:repeat(auto-fill,minmax(260px,1fr));gap:10px}
.file{display:flex;align-items:center;padding:10px;border-radius:8px;border:1px solid rgba(15,23,42,0.04);background:linear-gradient(180deg,rgba(0,0,0,0.01),transparent)}
.file a{display:flex;align-items:center;gap:12px;width:100%;color:inherit;text-decoration:none}
.icon{width:44px;height:44px;border-radius:8px;display:flex;align-items:center;justify-content:center;background:rgba(37,99,235,0.08);font-size:20px}
.name{font-weight:500}
.meta{margin-left:auto;font-size:12px;color:var(--muted)}
.parent{grid-column:1/-1;padding:0 4px}
.empty{padding:18px;text-align:center;color:var(--muted)}
@media (max-width:600px){.file-list{grid-template-columns:1fr}}
`;

/**
 * Generates Directory Listing HTML.
 * @param entries {FileEntry[]} - The array of file entries to generate the directory listing for.
 * @param urlPath {string} - The URL path of the directory.
 * @returns {string} - The generated directory listing HTML.
 */
const generateDirectoryListingHTML = (
  entries: FileEntry[],
  urlPath: string,
) => {
  const parentDir = urlPath === "/" ? null : { name: "..", url: join(urlPath, "../").replace(/\\/g, "/"), isDirectory: true };

  const sorted = entries
    .slice()
    .sort((a, b) => {
      if (a.isDirectory !== b.isDirectory) return a.isDirectory ? -1 : 1;
      return a.name.toLowerCase().localeCompare(b.name.toLowerCase());
    });

  const items = sorted
    .map((entry) => {
      const icon = entry.isDirectory ? "📁" : "📄";
      const href = entry.url;
      return `<li class="file"><a href="${href}"><span class="icon">${icon}</span><span class="name">${entry.name}</span><span class="meta">${entry.isDirectory?"Dir":"File"}</span></a></li>`;
    })
    .join("\n");

  const parentHtml = parentDir
    ? `<li class="file parent"><a href="../"><span class="icon">⬆️</span><span class="name">..</span><span class="meta">Parent</span></a></li>`
    : "";

  const content = items || '<div class="empty">This folder is empty</div>';

  return /*html*/ `
<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <title>Listing of ${urlPath}</title>
  <style>${getCSSStyles()}</style>
  <style>/* small reset for injected scripts */ body > script{display:none}</style>
</head>
<body>
  <div class="container">
    <div class="card">
      <div class="header">
        <div>
          <h1 class="title">Listing of ${urlPath}</h1>
          <div class="path">${urlPath}</div>
        </div>
      </div>
      <ul class="file-list">
        ${parentHtml}
        ${content}
      </ul>
    </div>
  </div>
</body>
</html>`;
};

// --- Server Logic ---

/**
 * Serves a file.
 * @param filePath {string} - The path of the file to serve.
 * @param res ServerResponse - The response object to write the file content to.
 * @param config Config - The configuration object.
 * @returns {Promise<void>} - A promise that resolves when the file is served.
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
 * @param dirPath {string} - The path of the directory to serve.
 * @param urlPath {string} - The URL path of the directory.
 * @param res ServerResponse - The response object to write the directory listing to.
 * @param config Config - The configuration object.
 * @returns {Promise<void>} - A promise that resolves when the directory is served.
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
 * @param config {Config} - The configuration object.
 * @returns import('node:http').RequestListener
 * @returns {Promise<void>} - A promise that resolves when the directory is served.
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
 * @param config {Config} - The configuration object.
 * @returns {Promise<void>} - A promise that resolves when the directory is served.
 */
const startWatcher = async (config: Config): Promise<void> => {
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
