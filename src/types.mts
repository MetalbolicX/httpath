export interface Config {
  directory: string;
  hostname: string;
  port: number;
  rateLimitMaxRequests: number;
  rateLimitWindowMs: number;
  ignorePatterns: string[];
  enableDirectoryListing: boolean;
  logLevel: "info" | "debug" | "error";
  enableLiveReload: boolean;
  restartOnChange: boolean;
  trustProxy: boolean;
  /** Allow serving a known system/OS directory. Defaults to false. */
  allowProtectedDir: boolean;
  /**
   * Enable LAN access by binding to all network interfaces (0.0.0.0).
   * When true, the server will be accessible from other machines on the LAN.
   */
  lan?: boolean;
}

export const LIVE_RELOAD_ENDPOINT = "/livereload";
export const LIVE_RELOAD_MESSAGE = "reload";

export interface FileEntry {
  name: string;
  isDirectory: boolean;
  url: string;
}
