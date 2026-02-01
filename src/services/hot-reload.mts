// Hot-reload service with Server-Sent Events functionality
import { watch, FSWatcher } from "node:fs";
import { spawn } from "node:child_process";
import { EventEmitter } from "node:events";
import type {
  HotReloadOptions,
  SSEClient,
  ReloadEvent,
  HttpRequest,
  HttpResponse,
  Result,
} from "../types/index.mjs";
import {
  success,
  failure,
  tryCatch,
  mapToFileSystemError,
} from "../utils/result-pattern.mjs";

/**
 * Default hot-reload options
 */
export const DEFAULT_HOT_RELOAD_OPTIONS: Required<HotReloadOptions> = {
  watchPath: process.cwd(),
  ignored: [
    "node_modules",
    ".git",
    ".vscode",
    ".idea",
    "dist",
    "build",
    ".next",
    ".nuxt",
    "coverage",
    ".nyc_output",
    "*.log",
    ".DS_Store",
    "Thumbs.db",
  ],
  debounceMs: 500,
  restartOnChange: false,
};

/**
 * Hot-reload script that gets injected into HTML files
 */
export const HOT_RELOAD_SCRIPT = /*html*/`
<script>
(function() {
  'use strict';

  let eventSource;
  let reconnectAttempts = 0;
  const maxReconnectAttempts = 10;
  const baseReconnectDelay = 1000;

  function connect() {
    console.log('[HTTPath] Connecting to hot-reload server...');

    eventSource = new EventSource('/__reload__');

    eventSource.onopen = function() {
      console.log('[HTTPath] Hot-reload connected');
      reconnectAttempts = 0;

      // Show connection indicator
      showConnectionStatus('connected');
    };

    eventSource.onmessage = function(event) {
      const data = event.data;
      console.log('[HTTPath] Received reload signal:', data);

      if (data === 'reload') {
        console.log('[HTTPath] Reloading page...');
        showReloadNotification();

        // Small delay to show notification
        setTimeout(() => {
          window.location.reload();
        }, 200);
      }
    };

    eventSource.onerror = function() {
      console.warn('[HTTPath] Hot-reload connection lost');
      eventSource.close();

      showConnectionStatus('disconnected');

      if (reconnectAttempts < maxReconnectAttempts) {
        reconnectAttempts++;
        const delay = baseReconnectDelay * Math.pow(1.5, reconnectAttempts - 1);

        console.log(\`[HTTPath] Reconnecting in \${delay}ms... (attempt \${reconnectAttempts})\`);

        setTimeout(connect, delay);
      } else {
        console.error('[HTTPath] Max reconnection attempts reached. Please refresh the page.');
        showConnectionStatus('failed');
      }
    };
  }

  function showConnectionStatus(status) {
    const indicator = getOrCreateIndicator();

    switch (status) {
      case 'connected':
        indicator.style.background = '#28a745';
        indicator.title = 'Hot-reload connected';
        indicator.textContent = '🔄';
        break;
      case 'disconnected':
        indicator.style.background = '#ffc107';
        indicator.title = 'Hot-reload disconnected - attempting to reconnect...';
        indicator.textContent = '⏳';
        break;
      case 'failed':
        indicator.style.background = '#dc3545';
        indicator.title = 'Hot-reload failed - refresh page to reconnect';
        indicator.textContent = '❌';
        break;
    }
  }

  function showReloadNotification() {
    const notification = document.createElement('div');
    notification.style.cssText = \`
      position: fixed;
      top: 20px;
      right: 20px;
      background: #007bff;
      color: white;
      padding: 12px 20px;
      border-radius: 6px;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      font-size: 14px;
      font-weight: 500;
      box-shadow: 0 4px 12px rgba(0,0,0,0.15);
      z-index: 10000;
      animation: slideIn 0.3s ease-out;
    \`;

    notification.textContent = '🔄 Reloading...';

    const style = document.createElement('style');
    style.textContent = \`
      @keyframes slideIn {
        from { transform: translateX(100%); opacity: 0; }
        to { transform: translateX(0); opacity: 1; }
      }
    \`;

    document.head.appendChild(style);
    document.body.appendChild(notification);
  }

  function getOrCreateIndicator() {
    let indicator = document.getElementById('httpath-reload-indicator');

    if (!indicator) {
      indicator = document.createElement('div');
      indicator.id = 'httpath-reload-indicator';
      indicator.style.cssText = \`
        position: fixed;
        bottom: 20px;
        right: 20px;
        width: 40px;
        height: 40px;
        border-radius: 50%;
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 16px;
        color: white;
        font-weight: bold;
        cursor: pointer;
        box-shadow: 0 2px 8px rgba(0,0,0,0.2);
        z-index: 9999;
        transition: all 0.3s ease;
        user-select: none;
      \`;

      indicator.addEventListener('click', () => {
        if (eventSource && eventSource.readyState === EventSource.OPEN) {
          window.location.reload();
        } else {
          connect();
        }
      });

      document.body.appendChild(indicator);
    }

    return indicator;
  }

  // Start connection when DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', connect);
  } else {
    connect();
  }

  // Cleanup on page unload
  window.addEventListener('beforeunload', () => {
    if (eventSource) {
      eventSource.close();
    }
  });
})();
</script>`;

/**
 * HotReloadService class
 * Manages hot-reload functionality for development environments
 */
export class HotReloadService extends EventEmitter {
  private watcher: FSWatcher | null = null;
  private clients = new Map<string, SSEClient>();
  private options: Required<HotReloadOptions>;
  private debounceTimer: NodeJS.Timeout | null = null;

  constructor(options: HotReloadOptions = {}) {
    super();
    this.options = { ...DEFAULT_HOT_RELOAD_OPTIONS, ...options };
  }

  /**
   * Start watching for file changes
   * @returns Result indicating success or failure of starting the watcher
   */
  public start(): Result<void> {
    if (this.watcher) {
      this.stop();
    }

    const watchResult = tryCatch(() => {
      this.watcher = watch(
        this.options.watchPath,
        { recursive: true },
        (eventType, filename) => {
          if (filename) {
            this.handleFileChange(eventType, filename);
          }
        },
      );

      console.log(`🔄 Hot-reload watching: ${this.options.watchPath}`);

      // Handle process signals
      process.on("SIGINT", () => this.stop());
      process.on("SIGTERM", () => this.stop());
    }, mapToFileSystemError);

    if (!watchResult.success) {
      console.warn(
        "File watching not supported on this system:",
        watchResult.error,
      );
      return failure(watchResult.error);
    }

    return success(undefined);
  }

  /**
   * Stop watching for file changes
   * @description Stops the file system watcher and cleans up resources
   */
  public stop(): void {
    if (this.watcher) {
      this.watcher.close();
      this.watcher = null;
    }

    // Close all SSE connections
    for (const client of this.clients.values()) {
      this.removeClient(client.id);
    }

    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
      this.debounceTimer = null;
    }

    console.log("🔄 Hot-reload stopped");
  }

  /**
   * Handle new SSE connection from client
   * @param req - HTTP request
   * @param res - HTTP response
   */
  public handleSSEConnection(req: HttpRequest, res: HttpResponse): void {
    const clientId = this.generateClientId();

    // Set SSE headers
    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Headers": "Cache-Control",
      "Access-Control-Allow-Methods": "GET, OPTIONS",
    });

    // Send initial connection confirmation
    res.write("data: connected\n\n");

    // Create client object
    const client: SSEClient = {
      response: res,
      id: clientId,
      connectedAt: new Date(),
    };

    // Store client
    this.clients.set(clientId, client);

    // Handle client disconnect
    req.on("close", () => {
      this.removeClient(clientId);
    });

    req.on("aborted", () => {
      this.removeClient(clientId);
    });

    res.on("error", (error) => {
      console.warn(`SSE client error for ${clientId}:`, error.message);
      this.removeClient(clientId);
    });

    console.log(
      `🔗 Hot-reload client connected: ${clientId} (${this.clients.size} total)`,
    );
    this.emit("client-connected", clientId);
  }

  /**
   * Broadcast reload signal to all connected clients
   * @param event - Optional reload event details
   * @returns {void}
   */
  public broadcastReload(event?: ReloadEvent): void {
    if (this.clients.size === 0) return;

    const message = "data: reload\n\n";
    let disconnectedClients: string[] = [];

    for (const [clientId, client] of this.clients) {
      try {
        client.response.write(message);
      } catch (error) {
        console.warn(
          `Failed to send reload signal to client ${clientId}:`,
          error,
        );
        disconnectedClients = [...disconnectedClients, clientId];
      }
    }

    // Clean up disconnected clients
    for (const clientId of disconnectedClients) {
      this.removeClient(clientId);
    }

    console.log(`📡 Reload signal sent to ${this.clients.size} clients`);

    if (event) {
      this.emit("reload-triggered", event);
    }
  }

  /**
   * Inject hot-reload script into HTML content
   * @param htmlContent - HTML content to inject script into
   * @returns HTML content with injected hot-reload script
   */
  public injectScript(htmlContent: string): string {
    // Try to inject before </body>, fallback to </html>, then end of content
    if (htmlContent.includes("</body>")) {
      return htmlContent.replace("</body>", `${HOT_RELOAD_SCRIPT}</body>`);
    } else if (htmlContent.includes("</html>")) {
      return htmlContent.replace("</html>", `${HOT_RELOAD_SCRIPT}</html>`);
    } else {
      return htmlContent + HOT_RELOAD_SCRIPT;
    }
  }

  /**
   * Get number of connected clients
   * @returns {number} Number of connected clients
   */
  public getClientCount(): number {
    return this.clients.size;
  }

  /**
   * Get information about connected clients
   * @returns Array of client info objects
   */
  public getClientInfo(): Array<{ id: string; connectedAt: Date }> {
    return Array.from(this.clients.values()).map((client) => ({
      id: client.id,
      connectedAt: client.connectedAt,
    }));
  }

  /**
   * Handle file change events
   * @param eventType - Type of file system event
   * @param filename - Name of the changed file
   * @returns {void}
   */
  private handleFileChange(eventType: string, filename: string): void {
    // Skip ignored files/directories
    if (this.shouldIgnoreFile(filename)) {
      return;
    }

    // Debounce file changes to avoid spam
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
    }

    this.debounceTimer = setTimeout(() => {
      console.log(`📝 File changed: ${filename}`);

      const reloadEvent: ReloadEvent = {
        type: this.getEventType(eventType),
        path: filename,
        timestamp: new Date(),
      };

      // Classification: determine whether to restart server or broadcast reload
      const shouldRestart = this.shouldRestartServer([filename]);
      const shouldReload = this.shouldTriggerBrowserReload([filename]);

      if (this.options.restartOnChange || shouldRestart) {
        console.log(`🔁 Restart requested due to change: ${filename}`);
        try {
          this.restartProcess();
        } catch (err) {
          console.warn("Failed to restart process:", err);
        }
        return;
      }

      if (shouldReload) {
        this.broadcastReload(reloadEvent);
        this.emit("file-changed", reloadEvent);
      } else {
        // Not a known reload/restart type — still emit generic event
        this.emit("file-changed", reloadEvent);
      }
    }, this.options.debounceMs);
  }

  /**
   * Check if a file should be ignored based on configured ignored patterns
   * @param filename - Name of the file to check
   * @returns boolean indicating if file should be ignored
   */
  private shouldIgnoreFile(filename: string): boolean {
    return this.options.ignored.some((pattern) => {
      if (pattern.includes("*")) {
        // Convert glob pattern to regex
        const regex = new RegExp(pattern.replace(/\*/g, ".*"), "i");
        return regex.test(filename);
      }
      return filename.includes(pattern);
    });
  }

  /**
   * Map fs.watch event type to ReloadEvent type
   * @param eventType - Event type from fs.watch
   * @returns Corresponding ReloadEvent type
   */
  private getEventType(eventType: string): ReloadEvent["type"] {
    switch (eventType) {
      case "change":
        return "file-changed";
      case "rename":
        return "file-added"; // Could be added or removed, but we'll treat as added
      default:
        return "file-changed";
    }
  }

  /**
   * Decide if any of the given paths should trigger a server restart
   * @param paths - Array of changed file paths
   * @returns {boolean} indicating if server should restart
   */
  private shouldRestartServer(paths: string[]): boolean {
    const serverRestartPatterns = [
      /\.ts$/i,
      /\.js$/i,
      /\.mjs$/i,
      /\.json$/i,
      /\.toml$/i,
      /\.ya?ml$/i,
      /deno\.json/i,
      /deno\.lock/i,
      /package\.json/i,
    ];

    return paths.some((p) => serverRestartPatterns.some((r) => r.test(p)));
  }

  /**
   * Decide if any of the given paths should trigger a browser reload
   * @param paths - Array of changed file paths
   * @returns {boolean} indicating if browser should reload
   */
  private shouldTriggerBrowserReload(paths: string[]): boolean {
    const browserReloadPatterns = [
      /\.html?$/i,
      /\.css$/i,
      /\.s[ac]ss$/i,
      /\.less$/i,
      /\.js$/i,
      /\.jsx$/i,
      /\.ts$/i,
      /\.tsx$/i,
      /\.vue$/i,
      /\.svelte$/i,
      /\.md$/i,
      /\.(png|jpe?g|gif|svg|webp|ico)$/i,
      /\.(woff2?|ttf|eot)$/i,
      /\.json$/i,
    ];

    return paths.some((p) => browserReloadPatterns.some((r) => r.test(p)));
  }

  /**
   * Restart the current Node.js process
   * @returns {void}
   */
  private restartProcess(): void {
    const args = process.argv.slice(1); // keep script and its args
    const child = spawn(process.execPath, args, {
      detached: true,
      stdio: "inherit",
    });

    child.unref();
    console.log("🔁 Spawned replacement process, exiting current process...");
    process.exit(0);
  }

  /**
   * Generate a unique client ID
   * @returns string representing the unique client ID
   */
  private generateClientId(): string {
    return `client_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Remove a client by ID
   * @param clientId - ID of the client to remove
   * @returns {void}
   */
  private removeClient(clientId: string): void {
    const client = this.clients.get(clientId);
    if (client) {
      tryCatch(
        () => client.response.end(),
        () => new Error("Error closing connection"),
      );

      this.clients.delete(clientId);
      console.log(
        `🔗 Hot-reload client disconnected: ${clientId} (${this.clients.size} remaining)`,
      );
      this.emit("client-disconnected", clientId);
    }
  }
}

/**
 * Create and return a HotReloadService instance
 * @param options - Hot-reload options
 * @returns HotReloadService instance
 */
export const createHotReloadService = (
  options?: HotReloadOptions,
): HotReloadService => new HotReloadService(options);
