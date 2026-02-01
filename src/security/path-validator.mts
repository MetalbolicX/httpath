// Path validation and security module
import { resolve, normalize, sep } from "node:path";
import type {
  PathValidationResult,
  SecurityOptions,
  Result,
} from "../types/index.mjs";
import { tryCatch, mapToSecurityError } from "../utils/result-pattern.mjs";

/**
 * Default security options
 */
export const DEFAULT_SECURITY_OPTIONS: Required<SecurityOptions> = {
  allowDotFiles: false,
  maxPathLength: 1000,
  blockedPatterns: [
    // Directory traversal patterns
    "../",
    "..\\",
    "%2e%2e%2f",
    "%2e%2e%5c",
    "..%2f",
    "..%5c",

    // Null byte injection
    "\0",
    "%00",

    // Control characters
    "\r",
    "\n",
    "\t",

    // Windows reserved names
    "CON",
    "PRN",
    "AUX",
    "NUL",
    "COM1",
    "COM2",
    "COM3",
    "COM4",
    "COM5",
    "COM6",
    "COM7",
    "COM8",
    "COM9",
    "LPT1",
    "LPT2",
    "LPT3",
    "LPT4",
    "LPT5",
    "LPT6",
    "LPT7",
    "LPT8",
    "LPT9",
  ],
};

/**
 * Dangerous file extensions that should be blocked
 */
export const DANGEROUS_EXTENSIONS = new Set([
  ".exe",
  ".bat",
  ".cmd",
  ".com",
  ".scr",
  ".pif",
  ".vbs",
  ".vbe",
  ".js",
  ".jar",
  ".app",
  ".deb",
  ".rpm",
  ".run",
  ".bin",
  ".sh",
  ".ps1",
  ".psm1",
  ".psd1",
  ".ps1xml",
  ".psc1",
  ".psc2",
]);

/**
 * System directories that should be protected
 */
export const PROTECTED_DIRECTORIES = new Set([
  "windows",
  "system32",
  "program files",
  "program files (x86)",
  "users",
  "documents and settings",
  "boot",
  "etc",
  "bin",
  "sbin",
  "usr",
  "var",
  "proc",
  "sys",
  "dev",
  "root",
  "home",
]);

/**
 * Verify if a path is safe within the root directory
 * @param requestedPath - The path to validate
 * @param rootPath - The root directory path
 * @param options - Security options
 * @returns {boolean} - True if the path is safe, false otherwise
 * @description
 * This function checks if the requested path is safe to access within the specified root directory.
 * It uses the validatePath function to perform comprehensive validation and returns a boolean indicating safety.
 */
export const isPathSafe = (
  requestedPath: string,
  rootPath: string,
  options: SecurityOptions = {},
): boolean => {
  const result = validatePath(requestedPath, rootPath, options);
  return result.isValid;
};

/**
 * Validate and resolve a requested path against a root directory
 * @param requestedPath - The path to validate
 * @param rootPath - The root directory path
 * @param options - Security options
 * @returns Result containing PathValidationResult or error
 * @description
 * This function performs comprehensive validation of the requested path. It checks for path length, blocked patterns,
 * URL decoding, path normalization, directory traversal, dot file access, and protected directories. If the path is valid,
 * it resolves the absolute path within the root directory and returns it. Otherwise, it returns an error detailing the violation.
 */
export const validatePath = (
  requestedPath: string,
  rootPath: string,
  options: SecurityOptions = {},
): Result<PathValidationResult> => {
  const opts = { ...DEFAULT_SECURITY_OPTIONS, ...options };

  // Basic input validation
  if (!requestedPath || typeof requestedPath !== "string") {
    const result: PathValidationResult = {
      isValid: false,
      resolvedPath: "",
      error: "Invalid path: path must be a non-empty string",
    };
    return failure(mapToSecurityError(new Error(result.error!)));
  }

  if (!rootPath || typeof rootPath !== "string") {
    const result: PathValidationResult = {
      isValid: false,
      resolvedPath: "",
      error: "Invalid root path: root path must be a non-empty string",
    };
    return failure(mapToSecurityError(new Error(result.error!)));
  }

  // Check path length
  if (requestedPath.length > opts.maxPathLength) {
    const result: PathValidationResult = {
      isValid: false,
      resolvedPath: "",
      error: `Path too long: exceeds ${opts.maxPathLength} characters`,
    };
    return failure(mapToSecurityError(new Error(result.error!)));
  }

  // URL decode the requested path
  const decodeResult = tryCatch(
    () => decodeURIComponent(requestedPath),
    () => mapToSecurityError(new Error("Invalid URL encoding in path")),
  );

  if (!decodeResult.success) {
    const result: PathValidationResult = {
      isValid: false,
      resolvedPath: "",
      error: "Invalid URL encoding in path",
    };
    return failure(decodeResult.error);
  }

  const decodedPath = decodeResult.data;

  // Check for blocked patterns
  const lowerPath = decodedPath.toLowerCase();
  for (const pattern of opts.blockedPatterns) {
    if (lowerPath.includes(pattern.toLowerCase())) {
      const result: PathValidationResult = {
        isValid: false,
        resolvedPath: "",
        error: `Blocked pattern detected: ${pattern}`,
      };
      return failure(mapToSecurityError(new Error(result.error!)));
    }
  }

  // Normalize path separators
  const normalizedPath = decodedPath.replace(/\\/g, "/");

  // Resolve the absolute path
  const resolveResult = tryCatch(
    () =>
      resolve(
        rootPath,
        normalizedPath.startsWith("/")
          ? normalizedPath.slice(1)
          : normalizedPath,
      ),
    mapToSecurityError,
  );

  if (!resolveResult.success) {
    const result: PathValidationResult = {
      isValid: false,
      resolvedPath: "",
      error: "Failed to resolve path",
    };
    return failure(resolveResult.error);
  }

  const resolvedPath = resolveResult.data;

  // Ensure the resolved path is within the root directory
  const normalizedRoot = normalize(rootPath);
  const normalizedResolved = normalize(resolvedPath);

  if (
    !normalizedResolved.startsWith(normalizedRoot + sep) &&
    normalizedResolved !== normalizedRoot
  ) {
    const result: PathValidationResult = {
      isValid: false,
      resolvedPath: "",
      error: "Path traversal detected: path is outside root directory",
    };
    return failure(mapToSecurityError(new Error(result.error!)));
  }

  // Check for dot files if not allowed
  if (!opts.allowDotFiles) {
    const pathParts = normalizedPath.split("/");
    for (const part of pathParts) {
      if (part.startsWith(".") && part !== "." && part !== "..") {
        const result: PathValidationResult = {
          isValid: false,
          resolvedPath: "",
          error: "Dot files not allowed",
        };
        return failure(mapToSecurityError(new Error(result.error!)));
      }
    }
  }

  // Check for protected directories
  const pathSegments = normalizedResolved.toLowerCase().split(sep);
  for (const segment of pathSegments) {
    if (PROTECTED_DIRECTORIES.has(segment)) {
      const result: PathValidationResult = {
        isValid: false,
        resolvedPath: "",
        error: `Access to protected directory denied: ${segment}`,
      };
      return failure(mapToSecurityError(new Error(result.error!)));
    }
  }

  const result: PathValidationResult = {
    isValid: true,
    resolvedPath: normalizedResolved,
  };

  return success(result);
};

/**
 * Sanitize filename by removing unsafe characters
 * @param filename - The filename to sanitize
 * @returns {string} Sanitized filename
 * @description
 * This function removes characters that are unsafe for filenames, such as control characters,
 * slashes, backslashes, and other reserved characters. It also trims leading and trailing dots
 * and replaces spaces with underscores. Finally, it limits the filename length to 255 characters.
 */
export const sanitizeFilename = (filename: string): string =>
  filename
    .replace(/[<>:"/\\|?*\x00-\x1f]/g, "") // Remove invalid characters
    .replace(/^\.+/, "") // Remove leading dots
    .replace(/\.+$/, "") // Remove trailing dots
    .replace(/\s+/g, "_") // Replace spaces with underscores
    .slice(0, 255); // Limit length

/**
 * Check if a filename has a dangerous extension
 * @param filename - The filename to check
 * @returns {boolean} True if the extension is dangerous, false otherwise
 * @description
 * This function checks if the file extension of the given filename is in the list of dangerous extensions.
 */
export const isDangerousExtension = (filename: string): boolean => {
  const extension = filename.toLowerCase().split(".").pop();
  return extension ? DANGEROUS_EXTENSIONS.has(`.${extension}`) : false;
};

/**
 * Get sanitized path components from a given path
 * @param path - The path to split into components
 * @returns {string[]} An array of sanitized path components
 * @description
 * This function splits the given path into its components, filters out empty components
 * and those representing current or parent directories, and sanitizes each component
 * to ensure it is safe for use as a filename.
 */
export const getPathComponents = (path: string): string[] =>
  path
    .split(/[/\\]/)
    .filter((component) => component && component !== "." && component !== "..")
    .map((component) => sanitizeFilename(component));

/**
 * Create a safe relative path from given segments
 * @param pathSegments - The path segments to combine
 * @returns {string} The combined safe relative path
 * @description
 * This function takes multiple path segments, splits them into components,
 * sanitizes each component, and then combines them into a single safe relative path.
 */
export const createSafeRelativePath = (...pathSegments: string[]): string => {
  const safeSegments = pathSegments
    .flatMap((segment) => getPathComponents(segment))
    .filter((segment) => segment.length > 0);

  return safeSegments.join("/");
};

/**
 * Validate and resolve a URL path against a root directory
 * @param urlPath - The URL path to validate
 * @param rootPath - The root directory path
 * @param options - Security options
 * @returns {PathValidationResult} The result of the path validation and resolution
 * @description
 * This function removes any query strings or fragments from the URL path,
 * then validates the cleaned path using the validatePath function.
 * It returns the result of the validation, including whether the path is valid
 * and the resolved absolute path within the root directory.
 */
export const resolveUrlPath = (
  urlPath: string,
  rootPath: string,
  options: SecurityOptions = {},
): PathValidationResult => {
  // Remove query string and fragment
  const cleanPath = urlPath.split("?")[0].split("#")[0];

  // Validate the path
  return validatePath(cleanPath, rootPath, options);
};

/**
 * Check if a path contains suspicious patterns
 * @param path - The path to check
 * @returns {boolean} True if the path contains suspicious patterns, false otherwise
 * @description
 * This function checks the given path against a set of known suspicious patterns
 * that may indicate directory traversal attempts, URL encoding attacks, null byte injections,
 * or the presence of control characters. It returns true if any such patterns are found.
 */
export const containsSuspiciousPatterns = (path: string): boolean => {
  const suspiciousPatterns = [
    /\.\./, // Directory traversal
    /\/\//, // Double slashes
    /\\{2,}/, // Multiple backslashes
    /%2e%2e/i, // URL encoded ..
    /%2f%2f/i, // URL encoded //
    /\0/, // Null bytes
    /[\x00-\x1f]/, // Control characters
  ];

  return suspiciousPatterns.some((pattern) => pattern.test(path));
};

/**
 * Create a security audit log entry
 * @param path - The requested path
 * @param result - The result of path validation
 * @param clientIP - Optional client IP address
 * @returns {SecurityAuditEntry} The security audit entry
 * @description
 * This function creates a security audit log entry containing the timestamp,
 * requested path, validation result, optional client IP address, and severity level.
 */
export const createSecurityAuditEntry = (
  path: string,
  result: PathValidationResult,
  clientIP?: string,
) => ({
    timestamp: new Date().toISOString(),
    path,
    isValid: result.isValid,
    error: result.error,
    clientIP,
    severity: result.isValid ? "info" : "warning",
  });

/**
 * Create security middleware factory
 * @param rootPath - The root directory path
 * @param options - Security options
 * @returns {Function} The security middleware function
 * @description
 * This function creates a middleware function for security validation of incoming requests.
 * It uses the validatePath function to check the requested URL path against the root directory
 */
export const createSecurityMiddleware = (
  rootPath: string,
  options: SecurityOptions = {},
) => {
  const opts = { ...DEFAULT_SECURITY_OPTIONS, ...options };

  return (req: any, res: any, next: () => void) => {
    const url = req.url || "/";
    const validationResult = validatePath(url, rootPath, opts);

    if (!validationResult.success) {
      // Log security violation
      const pathResult: PathValidationResult = {
        isValid: false,
        resolvedPath: "",
        error: validationResult.error.message,
      };
      const auditEntry = createSecurityAuditEntry(url, pathResult, req.ip);
      console.warn("🔒 Security violation:", auditEntry);

      // Send 403 Forbidden response
      res.writeHead(403, { "Content-Type": "text/plain" });
      res.end("403 Forbidden - Access denied");
      return;
    }

    const result = validationResult.data;
    if (!result.isValid) {
      // Log security violation
      const auditEntry = createSecurityAuditEntry(url, result, req.ip);
      console.warn("🔒 Security violation:", auditEntry);

      // Send 403 Forbidden response
      res.writeHead(403, { "Content-Type": "text/plain" });
      res.end("403 Forbidden - Access denied");
      return;
    }

    // Add resolved path to request for downstream use
    req.safePath = result.resolvedPath;
    next();
  };
};
