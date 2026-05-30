import type { Config, FileEntry } from "../types.mts";
import { LIVE_RELOAD_ENDPOINT } from "../types.mts";
import { basename, join, relative, resolve } from "@std/path";
import {
  getMimeType,
  log,
  hasSymlinkPrefix,
  matchesPattern,
  resolveSafePath,
} from "../utils/index.ts";
import { addSecurityHeaders } from "../security/headers.mts";
import { createRateLimiter } from "../security/rate-limiter.mts";
import { timingSafeEqual } from "../security/timing-safe.mts";
import {
  generateDirectoryListingHTML,
  injectLiveReloadScript,
} from "../ui/index.ts";
import { handleWebSocket } from "./websocket.mts";

type SupportedMethod = "GET" | "HEAD";

const DIRECTORY_LISTING_ENTRY_LIMIT = 100;

const compareDirectoryEntries = (a: FileEntry, b: FileEntry): number => {
  if (a.isDirectory && !b.isDirectory) return -1;
  if (!a.isDirectory && b.isDirectory) return 1;
  return a.name.localeCompare(b.name);
};

export interface RequestContext {
  remoteAddr: {
    hostname: string;
    port: number;
    transport: string;
  };
}

export const resolveRateLimitClientKey = (
  request: Request,
  context: RequestContext | undefined,
  trustProxy: boolean,
): string => {
  if (trustProxy) {
    const forwardedFor = request.headers.get("x-forwarded-for");
    const [clientIp] = forwardedFor?.split(",") ?? [];
    if (clientIp?.trim()) return clientIp.trim();
  }

  return context?.remoteAddr.hostname ?? "unknown";
};

export const isAllowedWebSocketOrigin = (request: Request): boolean => {
  const origin = request.headers.get("origin");
  if (!origin) return false;

  try {
    return origin === new URL(request.url).origin;
  } catch {
    return false;
  }
};

/**
 * Returns true when the resolved safe path matches any configured ignore pattern,
 * tested against the path relative to the serve directory.
 */
const isIgnoredSafePath = (safePath: string, config: Config): boolean => {
  const relativePath = relative(resolve(config.directory), safePath);
  // Normalise separators for cross-platform consistency
  return matchesPattern(
    relativePath.replaceAll("\\", "/"),
    config.ignorePatterns,
  );
};

const withSecurityHeaders = (response: Response): Response =>
  addSecurityHeaders(response);

/**
 * Serves a file with appropriate MIME type and headers.
 *
 * If live reload is enabled and the file is HTML, injects a live reload script
 * into the HTML content. Otherwise, returns the file as-is with streaming support.
 *
 * @param filePath - The path to the file to serve
 * @param config - Configuration object containing enableLiveReload flag and port
 * @param method - The HTTP method (GET or HEAD)
 * @returns A Promise that resolves to a Response with the file content and appropriate headers
 * @throws May throw if the file cannot be read or opened
 */

const serveFile = async (
  filePath: string,
  config: Config,
  method: SupportedMethod,
): Promise<Response> => {
  const mimeType = getMimeType(filePath);

  if (config.enableLiveReload && mimeType.includes("text/html")) {
    if (method === "HEAD") {
      return new Response(null, {
        headers: {
          "content-type": "text/html; charset=utf-8",
          "cache-control": "no-cache",
        },
      });
    }

    const html = await Deno.readTextFile(filePath);
    const modifiedHtml = injectLiveReloadScript(html, config.port);

    return new Response(modifiedHtml, {
      headers: {
        "content-type": "text/html; charset=utf-8",
        "cache-control": "no-cache",
      },
    });
  }

  const headers: Record<string, string> = {
    "content-type": mimeType,
    "cache-control": "no-cache",
  };

  if (mimeType === "image/svg+xml") {
    headers["content-disposition"] = `attachment; filename="${basename(filePath)}"`;
  }

  if (method === "HEAD") {
    return new Response(null, { headers });
  }

  const file = await Deno.open(filePath, { read: true });
  return new Response(file.readable, { headers });
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
  method: SupportedMethod,
): Promise<Response> => {
  if (method === "HEAD") {
    return new Response(null, {
      headers: { "content-type": "text/html; charset=utf-8" },
    });
  }

  const entries: FileEntry[] = (await Array.fromAsync(Deno.readDir(dirPath)))
    .filter(
      (entry) => !matchesPattern(entry.name, config.ignorePatterns),
    )
    .map((entry) => ({
      name: entry.name,
      isDirectory: entry.isDirectory,
      url: urlPath === "/"
        ? `/${encodeURIComponent(entry.name)}`
        : `${urlPath}/${encodeURIComponent(entry.name)}`,
    }))
    .sort(compareDirectoryEntries);

  const truncatedCount = Math.max(
    entries.length - DIRECTORY_LISTING_ENTRY_LIMIT,
    0,
  );
  const visibleEntries = entries.slice(0, DIRECTORY_LISTING_ENTRY_LIMIT);

  let html = generateDirectoryListingHTML(visibleEntries, urlPath);

  if (truncatedCount > 0) {
    html = html.replace(
      "</main>",
      `<div class="empty-state">Directory listing truncated after ${DIRECTORY_LISTING_ENTRY_LIMIT} entries (${truncatedCount} more not shown)</div></main>`,
    );
  }

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
/**
 * Decodes and validates an HTTP Basic Auth header against the expected credentials.
 *
 * Returns `true` when the header is absent, malformed, or the decoded credentials
 * do not match. Returns `false` (i.e. "rejected") only when a matching pair is
 * found — naming follows the pattern "should reject?".
 */
const rejectBasicAuth = (
  authHeader: string | null,
  expected: { username: string; password: string },
): boolean => {
  if (!authHeader?.startsWith("Basic ")) return true;

  let decoded: string;
  try {
    decoded = atob(authHeader.slice(6));
  } catch {
    return true;
  }

  const colon = decoded.indexOf(":");
  const username = colon === -1 ? decoded : decoded.slice(0, colon);
  const password = colon === -1 ? "" : decoded.slice(colon + 1);

  const usernameMatches = timingSafeEqual(username, expected.username);
  const passwordMatches = timingSafeEqual(password, expected.password);

  return !usernameMatches || !passwordMatches;
};

const missingBasicAuthHeader = (authHeader: string | null): boolean =>
  !authHeader || !authHeader.startsWith("Basic ");

export const createRequestHandler = (config: Config) => {
  const rateLimiter = createRateLimiter();

  return async (
    request: Request,
    context?: RequestContext,
  ): Promise<Response> => {
    const requestBody = request.body as ReadableStream<Uint8Array> | null;
    if (requestBody) {
      await requestBody.cancel();
      return withSecurityHeaders(
        new Response("Payload Too Large", {
          status: 413,
        }),
      );
    }

    if (config.auth) {
      const clientIp = resolveRateLimitClientKey(
        request,
        context,
        config.trustProxy,
      );
      const authHeader = request.headers.get("authorization");
      if (missingBasicAuthHeader(authHeader)) {
        if (!rateLimiter.check(clientIp)) {
          return withSecurityHeaders(
            new Response("Too Many Requests", {
              status: 429,
            }),
          );
        }
        return withSecurityHeaders(
          new Response("Unauthorized", {
            status: 401,
            headers: { "www-authenticate": `Basic realm="httpath"` },
          }),
        );
      }
      if (rejectBasicAuth(authHeader, config.auth)) {
        if (!rateLimiter.check(clientIp)) {
          return withSecurityHeaders(
            new Response("Too Many Requests", {
              status: 429,
            }),
          );
        }
        return withSecurityHeaders(
          new Response("Unauthorized", {
            status: 401,
          }),
        );
      }
    }

    const method = request.method.toUpperCase();
    if (method !== "GET" && method !== "HEAD") {
      const requestBody = request.body as ReadableStream<Uint8Array> | null;
      if (requestBody) {
        await requestBody.cancel();
      }
      return withSecurityHeaders(
        new Response("Method Not Allowed", {
          status: 405,
          headers: {
            "allow": "GET, HEAD",
          },
        }),
      );
    }

    const supportedMethod = method as SupportedMethod;
    const url = new URL(request.url);
    let pathname: string;

    try {
      pathname = decodeURIComponent(url.pathname);
    } catch {
      log(`Malformed URL path: ${url.pathname}`, "error");
      return withSecurityHeaders(new Response("Bad Request", { status: 400 }));
    }

    log(`${supportedMethod} ${pathname}`, "debug");

    if (
      config.enableLiveReload &&
      pathname === LIVE_RELOAD_ENDPOINT &&
      request.headers.get("upgrade") === "websocket"
    ) {
      if (!isAllowedWebSocketOrigin(request)) {
        return withSecurityHeaders(new Response("Forbidden", { status: 403 }));
      }
      return withSecurityHeaders(handleWebSocket(request));
    }

    const safePath = resolveSafePath(config.directory, pathname);
    if (!safePath) {
      log(`Forbidden access attempt: ${pathname}`, "error");
      return withSecurityHeaders(new Response("Forbidden", { status: 403 }));
    }

    if (isIgnoredSafePath(safePath, config)) {
      log(`Blocked ignored path access: ${pathname}`, "debug");
      return withSecurityHeaders(new Response("Forbidden", { status: 403 }));
    }

    try {
      if (await hasSymlinkPrefix(config.directory, safePath)) {
        log(`Blocked symlink access: ${pathname}`, "error");
        return withSecurityHeaders(new Response("Forbidden", { status: 403 }));
      }

      const symlinkInfo = await Deno.lstat(safePath);

      if (symlinkInfo.isSymlink) {
        log(`Blocked symlink access: ${pathname}`, "error");
        return withSecurityHeaders(new Response("Forbidden", { status: 403 }));
      }

      const fileInfo = await Deno.stat(safePath);

      if (fileInfo.isFile) {
        return withSecurityHeaders(
          await serveFile(safePath, config, supportedMethod),
        );
      } else if (fileInfo.isDirectory) {
        if (config.enableDirectoryListing) {
          return withSecurityHeaders(
            await serveDirectory(
              safePath,
              pathname,
              config,
              supportedMethod,
            ),
          );
        } else {
          const indexPath = join(safePath, "index.html");
          try {
            const indexInfo = await Deno.lstat(indexPath);

            if (indexInfo.isSymlink) {
              log(`Blocked symlink access: ${pathname}/index.html`, "error");
              return withSecurityHeaders(
                new Response("Forbidden", { status: 403 }),
              );
            }

            await Deno.stat(indexPath);
            return withSecurityHeaders(
              await serveFile(indexPath, config, supportedMethod),
            );
          } catch {
            return withSecurityHeaders(
              new Response("Directory listing disabled", {
                status: 403,
              }),
            );
          }
        }
      }

      // Deno.stat can return symlinks or other special entries on some OSes
      return withSecurityHeaders(new Response("Not Found", { status: 404 }));
    } catch (error) {
      if (error instanceof Deno.errors.NotFound) {
        log(`File not found: ${pathname}`, "error");
        return withSecurityHeaders(new Response("Not Found", { status: 404 }));
      }
      log(`Server error: ${(error as Error).message}`, "error");
      return withSecurityHeaders(
        new Response("Internal Server Error", { status: 500 }),
      );
    }
  };
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
    hostname: config.hostname,
    port: config.port,
    signal: abortController.signal,
    handler,
  }).finished;
};
