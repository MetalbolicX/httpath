import type { Config, FileEntry } from "../types.mts";
import { join } from "@std/path";
import { getMimeType, log, resolveSafePath } from "../utils/index.ts";
import { generateDirectoryListingHTML, injectLiveReloadScript } from "../ui/index.ts";
import { handleWebSocket } from "./websocket.mts";

/**
 * Serves a file with appropriate MIME type and headers.
 *
 * If live reload is enabled and the file is HTML, injects a live reload script
 * into the HTML content. Otherwise, returns the file as-is with streaming support.
 *
 * @param filePath - The path to the file to serve
 * @param config - Configuration object containing enableLiveReload flag and port
 * @returns A Promise that resolves to a Response object with the file content and appropriate headers
 * @throws May throw an error if the file cannot be read or opened
 *
 * @example
 * ```typescript
 * const response = await serveFile('./index.html', {
 *   enableLiveReload: true,
 *   port: 3000
 * });
 * ```
 */
const serveFile = async (
  filePath: string,
  config: Config,
): Promise<Response> => {
  const mimeType = getMimeType(filePath);

  if (config.enableLiveReload && mimeType.includes("text/html")) {
    const html = await Deno.readTextFile(filePath);
    const modifiedHtml = injectLiveReloadScript(html, config.port);

    return new Response(modifiedHtml, {
      headers: {
        "content-type": "text/html; charset=utf-8",
        "cache-control": "no-cache",
      },
    });
  }

  const file = await Deno.open(filePath, { read: true });
  return new Response(file.readable, {
    headers: {
      "content-type": mimeType,
      "cache-control": "no-cache",
    },
  });
};

/**
 * Serves a directory listing as an HTML response.
 *
 * Reads the contents of the specified directory, filters entries based on ignore patterns,
 * and generates an HTML directory listing. Optionally injects a live reload script if enabled.
 *
 * @param dirPath - The file system path to the directory to serve
 * @param urlPath - The URL path corresponding to the directory
 * @param config - Configuration object containing ignore patterns, live reload settings, and port
 * @returns A Promise that resolves to an HTTP Response with the directory listing HTML
 *
 * @example
 * ```typescript
 * const response = await serveDirectory('./public', '/public', {
 *   ignorePatterns: ['.git', 'node_modules'],
 *   enableLiveReload: true,
 *   port: 3000
 * });
 * ```
 */
const serveDirectory = async (
  dirPath: string,
  urlPath: string,
  config: Config,
): Promise<Response> => {
  const entries: FileEntry[] = (await Array.fromAsync(Deno.readDir(dirPath)))
    .filter(
      (entry) =>
        !config.ignorePatterns.some((pattern) => entry.name.includes(pattern)),
    )
    .map((entry) => ({
      name: entry.name,
      isDirectory: entry.isDirectory,
      url: urlPath === "/"
        ? `/${encodeURIComponent(entry.name)}`
        : `${urlPath}/${encodeURIComponent(entry.name)}`,
    }));

  let html = generateDirectoryListingHTML(entries, urlPath);

  if (config.enableLiveReload) {
    html = injectLiveReloadScript(html, config.port);
  }

  return new Response(html, {
    headers: { "content-type": "text/html; charset=utf-8" },
  });
};

/**
 * Creates a request handler function for the HTTP server.
 *
 * @param config - The server configuration object containing settings like directory path, live reload status, and directory listing preferences
 * @returns An async function that processes HTTP requests and returns appropriate responses
 *
 * @remarks
 * The handler processes incoming requests by:
 * - Decoding the URL pathname
 * - Checking for WebSocket upgrade requests for live reload functionality
 * - Validating the requested path for security (preventing directory traversal)
 * - Serving files or directories based on configuration
 * - Handling errors appropriately with corresponding HTTP status codes
 *
 * @example
 * ```typescript
 * const config: Config = {
 *   directory: './public',
 *   enableLiveReload: true,
 *   enableDirectoryListing: false
 * };
 * const handler = createRequestHandler(config);
 * const response = await handler(request);
 * ```
 */
export const createRequestHandler =
  (config: Config) => async (request: Request): Promise<Response> => {
    const url = new URL(request.url);
    const pathname = decodeURIComponent(url.pathname);

    log(`${request.method} ${pathname}`, "debug");

    if (
      config.enableLiveReload &&
      pathname === "/livereload" &&
      request.headers.get("upgrade") === "websocket"
    ) {
      return handleWebSocket(request);
    }

    const safePath = resolveSafePath(config.directory, pathname);
    if (!safePath) {
      log(`Forbidden access attempt: ${pathname}`, "error");
      return new Response("Forbidden", { status: 403 });
    }

    try {
      const fileInfo = await Deno.stat(safePath);

      if (fileInfo.isFile) {
        return await serveFile(safePath, config);
      } else if (fileInfo.isDirectory) {
        if (config.enableDirectoryListing) {
          return await serveDirectory(safePath, pathname, config);
        } else {
          const indexPath = join(safePath, "index.html");
          try {
            await Deno.stat(indexPath);
            return await serveFile(indexPath, config);
          } catch {
            return new Response("Directory listing disabled", {
              status: 403,
            });
          }
        }
      }
    } catch (error) {
      if (error instanceof Deno.errors.NotFound) {
        log(`File not found: ${pathname}`, "error");
        return new Response("Not Found", { status: 404 });
      }
      log(`Server error: ${(error as Error).message}`, "error");
      return new Response("Internal Server Error", { status: 500 });
    }

    return new Response("Bad Request", { status: 400 });
  };

/**
 * Starts an HTTP server with the provided configuration.
 *
 * @param config - The server configuration containing port and directory settings
 * @param abortController - An AbortController to signal server shutdown
 * @returns A promise that resolves when the server starts, and rejects if startup fails
 *
 * @example
 * ```ts
 * const config = { port: 8080, directory: './public' };
 * const controller = new AbortController();
 * await startHttpServer(config, controller);
 * ```
 */
export const startHttpServer = async (
  config: Config,
  abortController: AbortController,
): Promise<void> => {
  const handler = createRequestHandler(config);

  log(`Starting server on http://localhost:${config.port}`);
  log(`Serving directory: ${config.directory}`);

  await Deno.serve({
    port: config.port,
    signal: abortController.signal,
    handler,
  }).finished;
};
