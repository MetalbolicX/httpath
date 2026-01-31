// Type definitions for HTTPath server
import type { IncomingMessage, ServerResponse } from "node:http";

// Configuration types
export interface ServerConfig {
  port: number;
  rootPath: string;
  reload: boolean;
}

export interface CliOptions {
  port?: string;
  path?: string;
  reload?: boolean;
}

// File system types
export interface FileEntry {
  name: string;
  isDir: boolean;
  size?: number;
  lastModified?: Date;
}

export interface DirectoryListingOptions {
  showHidden?: boolean;
  sortBy?: "name" | "size" | "date";
  sortOrder?: "asc" | "desc";
}

// HTTP types
export interface HttpRequest extends IncomingMessage {
  url: string;
  method: string;
}

export interface HttpResponse extends ServerResponse {
  writeHead(statusCode: number, headers?: Record<string, string>): void;
  end(chunk?: string): void;
  write(chunk: string): void;
}

// Security types
export interface SecurityOptions {
  allowDotFiles?: boolean;
  maxPathLength?: number;
  blockedPatterns?: string[];
}

export interface PathValidationResult {
  isValid: boolean;
  resolvedPath: string;
  error?: string;
}

// Hot-reload types
export interface HotReloadOptions {
  watchPath: string;
  ignored?: string[];
  debounceMs?: number;
}

export interface SSEClient {
  response: HttpResponse;
  id: string;
  connectedAt: Date;
}

export interface ReloadEvent {
  type: "file-changed" | "directory-changed" | "file-added" | "file-removed";
  path: string;
  timestamp: Date;
}

// Server types
export interface ServerInstance {
  port: number;
  server: import("http").Server;
  config: ServerConfig;
  stop: () => Promise<void>;
}

export interface PortFinderOptions {
  startPort: number;
  endPort?: number;
  timeout?: number;
}

// Logger types
export type LogLevel = "debug" | "info" | "warn" | "error";

export interface LogEntry {
  level: LogLevel;
  message: string;
  timestamp: Date;
  method?: string;
  url?: string;
  statusCode?: number;
  responseTime?: number;
}

export interface LoggerOptions {
  level: LogLevel;
  format?: "simple" | "json" | "detailed";
  includeTimestamp?: boolean;
  colorize?: boolean;
}

// MIME types
export type MimeTypeMapping = Record<string, string>;

export interface MimeTypeOptions {
  defaultType?: string;
  customMappings?: MimeTypeMapping;
}

// Error types
export interface HTTPathError extends Error {
  code: string;
  statusCode?: number;
  path?: string;
}

export interface ErrorHandlerOptions {
  showStackTrace?: boolean;
  logErrors?: boolean;
  customErrorPages?: Record<number, string>;
}

// Middleware types
export type RequestHandler = (
  req: HttpRequest,
  res: HttpResponse,
  next?: () => void,
) => void | Promise<void>;

export interface MiddlewareOptions {
  cors?: boolean;
  compression?: boolean;
  rateLimit?: {
    windowMs: number;
    max: number;
  };
}

// Template types
export interface TemplateData {
  title: string;
  path: string;
  files: FileEntry[];
  parentPath?: string;
  serverInfo?: {
    name: string;
    version: string;
    uptime: number;
  };
}

export interface TemplateOptions {
  customCSS?: string;
  customJS?: string;
  favicon?: string;
  theme?: "light" | "dark" | "auto";
}

// Event types
export interface ServerEvents {
  "server-start": (port: number) => void;
  "server-stop": () => void;
  request: (req: HttpRequest, res: HttpResponse) => void;
  "file-served": (path: string, size: number) => void;
  "directory-listed": (path: string, fileCount: number) => void;
  "hot-reload-triggered": (path: string) => void;
  "client-connected": (clientId: string) => void;
  "client-disconnected": (clientId: string) => void;
  error: (error: HTTPathError) => void;
}

// Statistics types
export interface ServerStats {
  startTime: Date;
  requestCount: number;
  bytesServed: number;
  activeConnections: number;
  hotReloadClients: number;
  errorCount: number;
  uptime: number;
  memoryUsage: NodeJS.MemoryUsage;
}

// Plugin types
export interface Plugin {
  name: string;
  version: string;
  initialize: (server: ServerInstance) => void | Promise<void>;
  destroy?: () => void | Promise<void>;
}

export interface PluginManager {
  register: (plugin: Plugin) => void;
  unregister: (pluginName: string) => void;
  getPlugins: () => Plugin[];
}

// Utility types
export type DeepPartial<T> = {
  [P in keyof T]?: T[P] extends object ? DeepPartial<T[P]> : T[P];
};

export type RequiredFields<T, K extends keyof T> = T & Required<Pick<T, K>>;

export type OptionalFields<T, K extends keyof T> = Omit<T, K> &
  Partial<Pick<T, K>>;

// Result pattern types
export interface Success<T> {
  readonly success: true;
  readonly data: T;
  readonly error?: never;
}

export interface Failure<E = Error> {
  readonly success: false;
  readonly data?: never;
  readonly error: E;
}

export type Result<T, E = Error> = Success<T> | Failure<E>;

// Re-export Node.js types for convenience
export type { Server } from "http";
export type { Stats } from "fs";
export type { FSWatcher } from "fs";
