#!/usr/bin/env node

import { createServer } from "http";
import { readdir, stat } from "fs/promises";
import { watch, createReadStream } from "fs";
import { join, resolve, extname, basename } from "path";
import { EventEmitter } from "events";
import { parseArgs } from "util";

// MIME type mappings
const mimeTypes: Record<string, string> = {
  ".html": "text/html",
  ".htm": "text/html",
  ".js": "text/javascript",
  ".mjs": "text/javascript",
  ".css": "text/css",
  ".json": "application/json",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".txt": "text/plain",
  ".xml": "application/xml",
  ".pdf": "application/pdf",
  ".zip": "application/zip",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".ttf": "font/ttf",
  ".eot": "application/vnd.ms-fontobject",
};

// Hot-reload event hub
const reloadHub = new EventEmitter();
const sseClients = new Set<any>();

// Parse CLI arguments
function parseCliArgs() {
  const { values } = parseArgs({
    args: process.argv.slice(2),
    options: {
      port: {
        type: "string",
        short: "p",
        default: "8080",
      },
      path: {
        type: "string",
        short: "d",
        default: process.cwd(),
      },
      reload: {
        type: "boolean",
        short: "r",
        default: false,
      },
    },
    allowPositionals: true,
  });

  return {
    port: parseInt(values.port as string, 10) || 8080,
    rootPath: resolve(values.path as string),
    reload: Boolean(values.reload),
  };
}

// Security: Prevent directory traversal
function isPathSafe(requestedPath: string, rootPath: string): boolean {
  const resolvedPath = resolve(rootPath, requestedPath);
  return resolvedPath.startsWith(rootPath);
}

// Generate directory listing HTML
async function generateDirectoryListing(
  dirPath: string,
  urlPath: string,
): Promise<string> {
  try {
    const entries = await readdir(dirPath);
    const files: Array<{ name: string; isDir: boolean }> = [];

    for (const entry of entries) {
      const fullPath = join(dirPath, entry);
      const stats = await stat(fullPath);
      files.push({
        name: entry,
        isDir: stats.isDirectory(),
      });
    }

    // Sort directories first, then files
    files.sort((a, b) => {
      if (a.isDir && !b.isDir) return -1;
      if (!a.isDir && b.isDir) return 1;
      return a.name.localeCompare(b.name);
    });

    const parentLink =
      urlPath !== "/"
        ? `<li><a href="${urlPath.split("/").slice(0, -1).join("/") || "/"}">..</a></li>`
        : "";

    const fileList = files
      .map((file) => {
        const href = join(urlPath, file.name).replace(/\\/g, "/");
        const displayName = file.isDir ? `${file.name}/` : file.name;
        return `<li><a href="${href}">${displayName}</a></li>`;
      })
      .join("");

    return `
<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <title>Directory listing for ${urlPath}</title>
    <style>
        body { font-family: monospace; margin: 40px; }
        h1 { border-bottom: 1px solid #ccc; }
        ul { list-style: none; padding: 0; }
        li { margin: 5px 0; }
        a { text-decoration: none; color: #0066cc; }
        a:hover { text-decoration: underline; }
    </style>
</head>
<body>
    <h1>Directory listing for ${urlPath}</h1>
    <ul>
        ${parentLink}
        ${fileList}
    </ul>
</body>
</html>`;
  } catch (error) {
    return "<h1>Error reading directory</h1>";
  }
}

// Inject reload script into HTML content
function injectReloadScript(htmlContent: string): string {
  const reloadScript = `
<script>
(function() {
  const eventSource = new EventSource('/__reload__');
  eventSource.onmessage = function(event) {
    if (event.data === 'reload') {
      window.location.reload();
    }
  };
  eventSource.onerror = function() {
    // Reconnect after a short delay
    setTimeout(() => {
      window.location.reload();
    }, 1000);
  };
})();
</script>`;

  // Try to inject before </body>, fallback to end of content
  if (htmlContent.includes("</body>")) {
    return htmlContent.replace("</body>", `${reloadScript}</body>`);
  } else if (htmlContent.includes("</html>")) {
    return htmlContent.replace("</html>", `${reloadScript}</html>`);
  } else {
    return htmlContent + reloadScript;
  }
}

// Setup file watcher for hot-reload
function setupFileWatcher(rootPath: string) {
  try {
    const watcher = watch(
      rootPath,
      { recursive: true },
      (eventType, filename) => {
        if (filename) {
          console.log(`File changed: ${filename}`);
          reloadHub.emit("reload");
        }
      },
    );

    // Cleanup on exit
    process.on("SIGINT", () => {
      watcher.close();
    });

    console.log(`Watching for file changes in: ${rootPath}`);
  } catch (error) {
    console.warn("File watching not supported on this system");
  }
}

// Handle Server-Sent Events for reload
function handleReloadEndpoint(req: any, res: any) {
  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Cache-Control",
  });

  // Send initial connection confirmation
  res.write("data: connected\n\n");

  // Add client to the set
  sseClients.add(res);

  // Handle client disconnect
  req.on("close", () => {
    sseClients.delete(res);
  });

  req.on("aborted", () => {
    sseClients.delete(res);
  });
}

// Broadcast reload signal to all connected clients
function broadcastReload() {
  for (const client of sseClients) {
    try {
      client.write("data: reload\n\n");
    } catch (error) {
      sseClients.delete(client);
    }
  }
}

// Main server function
async function createFileServer(config: {
  port: number;
  rootPath: string;
  reload: boolean;
}) {
  const { port, rootPath, reload } = config;

  // Setup hot-reload if enabled
  if (reload) {
    setupFileWatcher(rootPath);
    reloadHub.on("reload", broadcastReload);
  }

  const server = createServer(async (req, res) => {
    const url = req.url || "/";
    const method = req.method || "GET";

    // Log the request
    console.log(`${method} ${url}`);

    // Handle reload endpoint
    if (url === "/__reload__" && reload) {
      handleReloadEndpoint(req, res);
      return;
    }

    // Security check
    if (!isPathSafe(url, rootPath)) {
      res.writeHead(403, { "Content-Type": "text/plain" });
      res.end("403 Forbidden - Access denied");
      return;
    }

    try {
      let filePath = join(rootPath, decodeURIComponent(url));
      const stats = await stat(filePath);

      if (stats.isDirectory()) {
        // Try to serve index.html
        const indexPath = join(filePath, "index.html");
        try {
          await stat(indexPath);
          filePath = indexPath;
        } catch {
          // Generate directory listing
          const listing = await generateDirectoryListing(filePath, url);
          let content = listing;

          if (reload) {
            content = injectReloadScript(content);
          }

          res.writeHead(200, { "Content-Type": "text/html" });
          res.end(content);
          return;
        }
      }

      // Serve the file
      const ext = extname(filePath).toLowerCase();
      const mimeType = mimeTypes[ext] || "application/octet-stream";

      res.writeHead(200, { "Content-Type": mimeType });

      // For HTML files, potentially inject reload script
      if ((ext === ".html" || ext === ".htm") && reload) {
        const { readFile } = await import("fs/promises");
        let content = await readFile(filePath, "utf8");
        content = injectReloadScript(content);
        res.end(content);
      } else {
        // Stream the file
        const stream = createReadStream(filePath);
        stream.pipe(res);

        stream.on("error", (error) => {
          res.writeHead(500, { "Content-Type": "text/plain" });
          res.end("500 Internal Server Error");
        });
      }
    } catch (error) {
      // File not found
      res.writeHead(404, { "Content-Type": "text/plain" });
      res.end("404 Not Found");
    }
  });

  // Find available port
  async function findAvailablePort(startPort: number): Promise<number> {
    return new Promise((resolve, reject) => {
      const testServer = createServer();
      testServer.listen(startPort, () => {
        const assignedPort = (testServer.address() as any)?.port || startPort;
        testServer.close(() => resolve(assignedPort));
      });
      testServer.on("error", (error: any) => {
        if (error.code === "EADDRINUSE") {
          resolve(findAvailablePort(startPort + 1));
        } else {
          reject(error);
        }
      });
    });
  }

  const availablePort = await findAvailablePort(port);

  server.listen(availablePort, () => {
    console.log(`\n🚀 Server running at http://localhost:${availablePort}`);
    console.log(`📁 Serving files from: ${rootPath}`);
    if (reload) {
      console.log(`🔄 Hot-reload enabled`);
    }
    console.log(`\nPress Ctrl+C to stop the server\n`);
  });

  // Graceful shutdown
  process.on("SIGINT", () => {
    console.log("\n\n👋 Shutting down gracefully...");

    // Close SSE connections
    for (const client of sseClients) {
      try {
        client.end();
      } catch (error) {
        // Ignore errors when closing connections
      }
    }
    sseClients.clear();

    server.close(() => {
      console.log("✅ Server stopped");
      process.exit(0);
    });
  });

  return server;
}

// Main execution
async function main() {
  try {
    const config = parseCliArgs();
    await createFileServer(config);
  } catch (error) {
    console.error("❌ Error starting server:", error);
    process.exit(1);
  }
}

// Run the server if this file is executed directly
if (
  process.argv[1] &&
  (process.argv[1].endsWith("/index.mjs") ||
    process.argv[1].endsWith("\\index.mjs") ||
    process.argv[1].includes("dist"))
) {
  main().catch(console.error);
}

export { createFileServer, parseCliArgs };
