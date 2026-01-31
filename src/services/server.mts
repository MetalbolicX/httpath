// HTTP server service with request handling
import { createServer, Server } from "node:http";
import { join, extname } from "node:path";
import type {
  ServerConfig,
  ServerInstance,
  HttpRequest,
  HttpResponse,
} from "../types/index.mjs";
import { validatePath } from "../security/path-validator.mjs";
import { getMimeTypeFromFilename } from "../constants/mime-types.mjs";
import {
  generateDirectoryListing,
  fileExists,
  getFileStat,
  readTextFile,
  createFileStream,
  getServingMethod,
} from "./file-service.mjs";
import { HotReloadService } from "./hot-reload.mjs";
import { createLogger } from "../utils/logger.mjs";
import { findAvailablePort } from "../utils/port-finder.mjs";
import {
  tryCatchAsync,
  mapToNetworkError,
  isSuccess,
  unwrapOr,
} from "../utils/result-pattern.mjs";

/**
 * HTTP Server service class
 */
export class HTTPServer {
  private server: Server | null = null;
  private config: ServerConfig;
  private hotReload: HotReloadService | null = null;
  private logger = createLogger();
  private isRunning = false;

  constructor(config: ServerConfig) {
    this.config = config;

    if (config.reload) {
      this.hotReload = new HotReloadService({
        watchPath: config.rootPath,
      });
    }
  }

  /**
   * Start the HTTP server
   */
  public async start(): Promise<ServerInstance> {
    if (this.isRunning) {
      throw new Error("Server is already running");
    }

    // Find available port
    const portResult = await findAvailablePort({ startPort: this.config.port });
    if (!isSuccess(portResult)) {
      throw new Error(
        `Failed to find available port: ${portResult.error.message}`,
      );
    }
    const port = portResult.data;

    // Create HTTP server
    this.server = createServer((req, res) => {
      this.handleRequest(req as HttpRequest, res as HttpResponse);
    });

    // Start hot-reload service if enabled
    if (this.hotReload) {
      const startResult = this.hotReload.start();
      if (isSuccess(startResult)) {
        this.logger.info("🔄 Hot-reload enabled");
      } else {
        this.logger.warn("Hot-reload failed to start:", startResult.error);
      }
    }

    // Start server
    return new Promise((resolve, reject) => {
      this.server!.listen(port, () => {
        this.isRunning = true;
        this.logger.info(`🚀 Server running at http://localhost:${port}`);
        this.logger.info(`📁 Serving files from: ${this.config.rootPath}`);
        this.logger.info(`\nPress Ctrl+C to stop the server\n`);

        const instance: ServerInstance = {
          port,
          server: this.server!,
          config: this.config,
          stop: () => this.stop(),
        };

        resolve(instance);
      });

      this.server!.on("error", (error: any) => {
        if (error.code === "EADDRINUSE") {
          reject(new Error(`Port ${port} is already in use`));
        } else {
          reject(error);
        }
      });
    });
  }

  /**
   * Stop the HTTP server
   */
  public async stop(): Promise<void> {
    if (!this.isRunning || !this.server) {
      return;
    }

    this.logger.info("\n\n👋 Shutting down gracefully...");

    // Stop hot-reload service
    if (this.hotReload) {
      this.hotReload.stop();
    }

    // Close server
    return new Promise((resolve) => {
      this.server!.close(() => {
        this.isRunning = false;
        this.logger.info("✅ Server stopped");
        resolve();
      });
    });
  }

  /**
   * Handle incoming HTTP requests
   */
  private async handleRequest(
    req: HttpRequest,
    res: HttpResponse,
  ): Promise<void> {
    const startTime = Date.now();
    const url = req.url || "/";
    const method = req.method || "GET";

    const requestResult = await tryCatchAsync(async () => {
      // Log the request
      this.logger.logRequest(method, url);

      // Handle hot-reload SSE endpoint
      if (url === "/__reload__" && this.hotReload) {
        this.hotReload.handleSSEConnection(req, res);
        return { statusCode: 200 };
      }

      // Only handle GET requests for file serving
      if (method !== "GET") {
        this.sendError(res, 405, "Method Not Allowed");
        return { statusCode: 405 };
      }

      // Validate path security
      const pathValidationResult = validatePath(url, this.config.rootPath);
      if (!isSuccess(pathValidationResult)) {
        this.logger.warn(
          `Security violation: ${pathValidationResult.error.message} - ${url}`,
        );
        this.sendError(res, 403, "Forbidden - Access denied");
        return { statusCode: 403 };
      }

      const pathValidation = pathValidationResult.data;
      if (!pathValidation.isValid) {
        this.logger.warn(
          `Security violation: ${pathValidation.error} - ${url}`,
        );
        this.sendError(res, 403, "Forbidden - Access denied");
        return { statusCode: 403 };
      }

      const safePath = pathValidation.resolvedPath;

      // Check if file/directory exists
      const existsResult = await fileExists(safePath);
      if (!isSuccess(existsResult) || !existsResult.data) {
        this.sendError(res, 404, "Not Found");
        return { statusCode: 404 };
      }

      const statsResult = await getFileStat(safePath);
      if (!isSuccess(statsResult)) {
        this.sendError(res, 500, "Internal Server Error");
        return { statusCode: 500 };
      }

      const stats = statsResult.data;

      if (stats.isDirectory()) {
        await this.handleDirectoryRequest(safePath, url, res);
      } else {
        await this.handleFileRequest(safePath, res);
      }

      return { statusCode: 200 };
    }, mapToNetworkError);

    // Handle result and log response
    const statusCode = unwrapOr(requestResult, { statusCode: 500 }).statusCode;
    const responseTime = Date.now() - startTime;

    if (!isSuccess(requestResult)) {
      this.logger.error("Request handling error:", requestResult.error);
      if (!res.headersSent) {
        this.sendError(res, 500, "Internal Server Error");
      }
    }

    this.logger.logResponse(statusCode, responseTime);
  }

  /**
   * Handle directory requests
   */
  private async handleDirectoryRequest(
    dirPath: string,
    urlPath: string,
    res: HttpResponse,
  ): Promise<void> {
    // Try to serve index.html first
    const indexPath = join(dirPath, "index.html");

    const indexExistsResult = await fileExists(indexPath);
    if (isSuccess(indexExistsResult) && indexExistsResult.data) {
      await this.handleFileRequest(indexPath, res);
      return;
    }

    // Generate directory listing
    const listingResult = await generateDirectoryListing(dirPath, urlPath);
    if (!isSuccess(listingResult)) {
      this.sendError(res, 500, "Error generating directory listing");
      return;
    }

    let content = listingResult.data;

    // Inject hot-reload script if enabled
    if (this.hotReload) {
      content = this.hotReload.injectScript(content);
    }

    res.writeHead(200, {
      "Content-Type": "text/html; charset=utf-8",
      "Content-Length": Buffer.byteLength(content, "utf8").toString(),
    });
    res.end(content);
  }

  /**
   * Handle file requests
   */
  private async handleFileRequest(
    filePath: string,
    res: HttpResponse,
  ): Promise<void> {
    const statsResult = await getFileStat(filePath);
    if (!isSuccess(statsResult)) {
      this.sendError(res, 500, "Internal Server Error");
      return;
    }

    const stats = statsResult.data;
    const ext = extname(filePath).toLowerCase();
    const mimeType = getMimeTypeFromFilename(filePath);
    const servingMethod = getServingMethod(filePath);

    // Set common headers
    const headers: Record<string, string> = {
      "Content-Type": mimeType,
      "Content-Length": stats.size.toString(),
      "Last-Modified": stats.mtime.toUTCString(),
      "Cache-Control": "public, max-age=0",
    };

    // Handle text files that might need hot-reload script injection
    if (
      servingMethod === "buffer" &&
      (ext === ".html" || ext === ".htm") &&
      this.hotReload
    ) {
      const contentResult = await readTextFile(filePath);
      if (isSuccess(contentResult)) {
        let content = this.hotReload.injectScript(contentResult.data);

        headers["Content-Length"] = Buffer.byteLength(
          content,
          "utf8",
        ).toString();
        res.writeHead(200, headers);
        res.end(content);
        return;
      } else {
        // Fallback to streaming if reading fails
        this.logger.warn(
          "Failed to read HTML file for script injection, falling back to streaming",
        );
      }
    }

    // Stream the file
    res.writeHead(200, headers);

    const stream = createFileStream(filePath);
    stream.pipe(res);

    stream.on("error", (error) => {
      this.logger.error("File stream error:", error);
      if (!res.headersSent) {
        this.sendError(res, 500, "Internal Server Error");
      }
    });

    res.on("error", (error) => {
      this.logger.error("Response error:", error);
    });
  }

  /**
   * Send error response
   */
  private sendError(
    res: HttpResponse,
    statusCode: number,
    statusText: string,
  ): void {
    if (res.headersSent) {
      return;
    }

    const errorBody = this.generateErrorPage(statusCode, statusText);

    res.writeHead(statusCode, {
      "Content-Type": "text/html; charset=utf-8",
      "Content-Length": Buffer.byteLength(errorBody, "utf8").toString(),
    });
    res.end(errorBody);
  }

  /**
   * Generate error page HTML
   */
  private generateErrorPage(statusCode: number, statusText: string): string {
    const errorMessages: Record<number, string> = {
      403: "You do not have permission to access this resource.",
      404: "The requested file or directory was not found.",
      405: "The requested method is not allowed for this resource.",
      500: "An internal server error occurred.",
    };

    const message = errorMessages[statusCode] || "An error occurred.";

    return `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${statusCode} ${statusText} - HTTPath</title>
    <style>
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            display: flex;
            justify-content: center;
            align-items: center;
            min-height: 100vh;
            margin: 0;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: white;
        }
        .error-container {
            text-align: center;
            padding: 60px 40px;
            background: rgba(255, 255, 255, 0.1);
            backdrop-filter: blur(10px);
            border-radius: 16px;
            border: 1px solid rgba(255, 255, 255, 0.2);
            box-shadow: 0 8px 32px rgba(0, 0, 0, 0.2);
            max-width: 500px;
        }
        .error-code {
            font-size: 6rem;
            font-weight: 700;
            margin-bottom: 20px;
            text-shadow: 0 4px 8px rgba(0, 0, 0, 0.3);
        }
        .error-title {
            font-size: 2rem;
            margin-bottom: 16px;
            font-weight: 600;
        }
        .error-message {
            font-size: 1.1rem;
            margin-bottom: 30px;
            opacity: 0.9;
            line-height: 1.6;
        }
        .error-footer {
            font-size: 0.9rem;
            opacity: 0.7;
            border-top: 1px solid rgba(255, 255, 255, 0.2);
            padding-top: 20px;
            margin-top: 30px;
        }
        .back-link {
            display: inline-block;
            margin-top: 20px;
            padding: 12px 24px;
            background: rgba(255, 255, 255, 0.2);
            border: 1px solid rgba(255, 255, 255, 0.3);
            border-radius: 8px;
            color: white;
            text-decoration: none;
            font-weight: 500;
            transition: all 0.3s ease;
        }
        .back-link:hover {
            background: rgba(255, 255, 255, 0.3);
            transform: translateY(-2px);
        }
    </style>
</head>
<body>
    <div class="error-container">
        <div class="error-code">${statusCode}</div>
        <h1 class="error-title">${statusText}</h1>
        <p class="error-message">${message}</p>
        <a href="/" class="back-link">← Go Home</a>
        <div class="error-footer">
            HTTPath Server
        </div>
    </div>
</body>
</html>`;
  }
}

/**
 * Create and configure HTTP server
 */
export const createHTTPServer = (config: ServerConfig): HTTPServer =>
  new HTTPServer(config);

/**
 * Start HTTP server with configuration
 */
export const startServer = async (
  config: ServerConfig,
): Promise<ServerInstance> => {
  const server = createHTTPServer(config);
  return await server.start();
};
