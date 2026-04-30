export interface Config {
  directory: string;
  port: number;
  ignorePatterns: string[];
  enableDirectoryListing: boolean;
  logLevel: "info" | "debug" | "error";
  enableLiveReload: boolean;
  restartOnChange: boolean;
  /** Allow serving a known system/OS directory. Defaults to false. */
  allowProtectedDir: boolean;
  /**
   * Basic Auth credentials. When set, every request (including WebSocket
   * live-reload) requires a valid `Authorization: Basic <base64>` header.
   * Populated from the `HTTPATH_USER` and `HTTPATH_PASS` environment variables.
   */
  auth?: { username: string; password: string };
}

export const LIVE_RELOAD_ENDPOINT = "/livereload";
export const LIVE_RELOAD_MESSAGE = "reload";

export interface FileEntry {
  name: string;
  isDirectory: boolean;
  url: string;
}
