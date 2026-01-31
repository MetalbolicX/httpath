// Logging utility module
import type { LogLevel, LogEntry, LoggerOptions } from "../types/index.mjs";

/**
 * Default logger options
 */
export const DEFAULT_LOGGER_OPTIONS: Required<LoggerOptions> = {
  level: "info",
  format: "simple",
  includeTimestamp: true,
  colorize: true,
};

/**
 * ANSI color codes for console output
 */
const COLORS = {
  reset: "\x1b[0m",
  bright: "\x1b[1m",
  dim: "\x1b[2m",
  red: "\x1b[31m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  blue: "\x1b[34m",
  magenta: "\x1b[35m",
  cyan: "\x1b[36m",
  white: "\x1b[37m",
  gray: "\x1b[90m",
} as const;

/**
 * Log level priorities for filtering
 */
const LOG_LEVELS = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
} as const;

/**
 * Log level colors
 */
const LEVEL_COLORS = {
  debug: COLORS.gray,
  info: COLORS.blue,
  warn: COLORS.yellow,
  error: COLORS.red,
} as const;

/**
 * Logger class for handling application logging
 */
export class Logger {
  private options: Required<LoggerOptions>;
  private startTime: number;

  constructor(options: LoggerOptions = {}) {
    this.options = { ...DEFAULT_LOGGER_OPTIONS, ...options };
    this.startTime = Date.now();
  }

  /**
   * Log debug message
   */
  public debug(message: string, ...args: any[]): void {
    this.log("debug", message, ...args);
  }

  /**
   * Log info message
   */
  public info(message: string, ...args: any[]): void {
    this.log("info", message, ...args);
  }

  /**
   * Log warning message
   */
  public warn(message: string, ...args: any[]): void {
    this.log("warn", message, ...args);
  }

  /**
   * Log error message
   */
  public error(message: string, ...args: any[]): void {
    this.log("error", message, ...args);
  }

  /**
   * Log HTTP request
   */
  public logRequest(method: string, url: string, userAgent?: string): void {
    const timestamp = this.formatTimestamp();
    const colorizedMethod = this.colorize(method, COLORS.cyan);
    const colorizedUrl = this.colorize(url, COLORS.white);

    let message = `${colorizedMethod} ${colorizedUrl}`;

    if (this.options.format === "detailed" && userAgent) {
      message += this.colorize(` - ${userAgent}`, COLORS.gray);
    }

    this.writeLog("info", message, timestamp);
  }

  /**
   * Log HTTP response
   */
  public logResponse(statusCode: number, responseTime?: number): void {
    const timestamp = this.formatTimestamp();
    const statusColor = this.getStatusColor(statusCode);
    const colorizedStatus = this.colorize(statusCode.toString(), statusColor);

    let message = `Response: ${colorizedStatus}`;

    if (responseTime !== undefined) {
      const timeColor =
        responseTime > 1000
          ? COLORS.yellow
          : responseTime > 500
            ? COLORS.cyan
            : COLORS.green;
      const colorizedTime = this.colorize(`${responseTime}ms`, timeColor);
      message += ` in ${colorizedTime}`;
    }

    this.writeLog("info", message, timestamp);
  }

  /**
   * Create a log entry object
   */
  public createLogEntry(
    level: LogLevel,
    message: string,
    meta?: Record<string, any>,
  ): LogEntry {
    return {
      level,
      message,
      timestamp: new Date(),
      ...meta,
    };
  }

  /**
   * Set log level
   */
  public setLevel(level: LogLevel): void {
    this.options.level = level;
  }

  /**
   * Get current log level
   */
  public getLevel(): LogLevel {
    return this.options.level;
  }

  /**
   * Check if a log level should be output
   */
  public shouldLog(level: LogLevel): boolean {
    return LOG_LEVELS[level] >= LOG_LEVELS[this.options.level];
  }

  /**
   * Get server uptime
   */
  public getUptime(): number {
    return Date.now() - this.startTime;
  }

  /**
   * Format uptime as human readable string
   */
  public formatUptime(): string {
    const uptime = this.getUptime();
    const seconds = Math.floor(uptime / 1000) % 60;
    const minutes = Math.floor(uptime / (1000 * 60)) % 60;
    const hours = Math.floor(uptime / (1000 * 60 * 60));

    if (hours > 0) {
      return `${hours}h ${minutes}m ${seconds}s`;
    } else if (minutes > 0) {
      return `${minutes}m ${seconds}s`;
    } else {
      return `${seconds}s`;
    }
  }

  /**
   * Core logging method
   */
  private log(level: LogLevel, message: string, ...args: any[]): void {
    if (!this.shouldLog(level)) {
      return;
    }

    const timestamp = this.formatTimestamp();
    const formattedMessage = this.formatMessage(message, args);

    this.writeLog(level, formattedMessage, timestamp);
  }

  /**
   * Write log to console
   */
  private writeLog(level: LogLevel, message: string, timestamp?: string): void {
    let output = "";

    // Add timestamp
    if (this.options.includeTimestamp && timestamp) {
      output += this.colorize(`[${timestamp}] `, COLORS.gray);
    }

    // Add level
    if (this.options.format !== "simple") {
      const levelText = level.toUpperCase().padEnd(5);
      output += this.colorize(`${levelText} `, LEVEL_COLORS[level]);
    }

    // Add message
    output += message;

    // Output to appropriate stream
    const stream = level === "error" ? process.stderr : process.stdout;
    stream.write(output + "\n");
  }

  /**
   * Format message with arguments
   */
  private formatMessage(message: string, args: any[]): string {
    if (args.length === 0) {
      return message;
    }

    // Simple string interpolation or append args
    let formatted = message;
    for (const arg of args) {
      if (typeof arg === "object") {
        formatted += " " + JSON.stringify(arg, null, 2);
      } else {
        formatted += " " + String(arg);
      }
    }

    return formatted;
  }

  /**
   * Format timestamp
   */
  private formatTimestamp(): string {
    const now = new Date();

    if (this.options.format === "json") {
      return now.toISOString();
    }

    // Simple format: HH:MM:SS
    return now.toLocaleTimeString("en-US", { hour12: false });
  }

  /**
   * Apply color to text if colorization is enabled
   */
  private colorize(text: string, color: string): string {
    if (!this.options.colorize || !process.stdout.isTTY) {
      return text;
    }
    return color + text + COLORS.reset;
  }

  /**
   * Get color for HTTP status code
   */
  private getStatusColor(statusCode: number): string {
    if (statusCode >= 200 && statusCode < 300) {
      return COLORS.green;
    } else if (statusCode >= 300 && statusCode < 400) {
      return COLORS.cyan;
    } else if (statusCode >= 400 && statusCode < 500) {
      return COLORS.yellow;
    } else if (statusCode >= 500) {
      return COLORS.red;
    }
    return COLORS.white;
  }
}

/**
 * Create a new logger instance
 */
export const createLogger = (options?: LoggerOptions): Logger =>
  new Logger(options);

/**
 * Default logger instance
 */
export const logger = createLogger();

/**
 * Performance timing utility
 */
export class Timer {
  private startTime: number;
  private endTime?: number;

  constructor() {
    this.startTime = process.hrtime.bigint();
  }

  /**
   * Stop the timer and return elapsed time in milliseconds
   */
  public stop(): number {
    this.endTime = process.hrtime.bigint();
    return Number(this.endTime - this.startTime) / 1_000_000;
  }

  /**
   * Get elapsed time without stopping the timer
   */
  public elapsed(): number {
    const currentTime = process.hrtime.bigint();
    return Number(currentTime - this.startTime) / 1_000_000;
  }

  /**
   * Reset the timer
   */
  public reset(): void {
    this.startTime = process.hrtime.bigint();
    this.endTime = undefined;
  }
}

/**
 * Create a new timer instance
 */
export const createTimer = (): Timer => new Timer();

/**
 * Request logging middleware
 */
export const createRequestLogger = (logger: Logger) => {
  return (req: any, res: any, next?: () => void) => {
    const timer = createTimer();
    const method = req.method || "GET";
    const url = req.url || "/";
    const userAgent = req.headers["user-agent"];

    logger.logRequest(method, url, userAgent);

    // Override res.end to log response
    const originalEnd = res.end;
    res.end = function (chunk?: any, encoding?: any) {
      const responseTime = Math.round(timer.stop());
      const statusCode = res.statusCode || 200;

      logger.logResponse(statusCode, responseTime);

      return originalEnd.call(this, chunk, encoding);
    };

    if (next) {
      next();
    }
  };
};
