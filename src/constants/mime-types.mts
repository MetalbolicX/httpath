// MIME type mappings and utilities
import type { MimeTypeMapping, MimeTypeOptions } from "../types/index.mjs";

/**
 * Default MIME type mappings for common file extensions
 */
export const DEFAULT_MIME_TYPES: MimeTypeMapping = {
  // Web files
  ".html": "text/html",
  ".htm": "text/html",
  ".css": "text/css",
  ".js": "text/javascript",
  ".mjs": "text/javascript",
  ".ts": "text/typescript",
  ".jsx": "text/jsx",
  ".tsx": "text/tsx",
  ".json": "application/json",
  ".xml": "application/xml",
  ".rss": "application/rss+xml",
  ".atom": "application/atom+xml",

  // Images
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".webp": "image/webp",
  ".bmp": "image/bmp",
  ".tiff": "image/tiff",
  ".tif": "image/tiff",

  // Fonts
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".ttf": "font/ttf",
  ".otf": "font/otf",
  ".eot": "application/vnd.ms-fontobject",

  // Documents
  ".pdf": "application/pdf",
  ".doc": "application/msword",
  ".docx":
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ".xls": "application/vnd.ms-excel",
  ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  ".ppt": "application/vnd.ms-powerpoint",
  ".pptx":
    "application/vnd.openxmlformats-officedocument.presentationml.presentation",

  // Text files
  ".txt": "text/plain",
  ".md": "text/markdown",
  ".csv": "text/csv",
  ".log": "text/plain",
  ".yaml": "text/yaml",
  ".yml": "text/yaml",
  ".toml": "text/plain",
  ".ini": "text/plain",
  ".conf": "text/plain",
  ".cfg": "text/plain",

  // Archives
  ".zip": "application/zip",
  ".rar": "application/vnd.rar",
  ".7z": "application/x-7z-compressed",
  ".tar": "application/x-tar",
  ".gz": "application/gzip",
  ".bz2": "application/x-bzip2",

  // Audio
  ".mp3": "audio/mpeg",
  ".wav": "audio/wav",
  ".ogg": "audio/ogg",
  ".m4a": "audio/mp4",
  ".aac": "audio/aac",
  ".flac": "audio/flac",

  // Video
  ".mp4": "video/mp4",
  ".avi": "video/x-msvideo",
  ".mov": "video/quicktime",
  ".wmv": "video/x-ms-wmv",
  ".flv": "video/x-flv",
  ".webm": "video/webm",
  ".mkv": "video/x-matroska",

  // Application files
  ".exe": "application/octet-stream",
  ".msi": "application/x-msdownload",
  ".deb": "application/vnd.debian.binary-package",
  ".rpm": "application/x-rpm",
  ".dmg": "application/x-apple-diskimage",
  ".iso": "application/x-iso9660-image",

  // Development files
  ".map": "application/json",
  ".lock": "text/plain",
  ".gitignore": "text/plain",
  ".env": "text/plain",
  ".dockerfile": "text/plain",
  ".makefile": "text/plain",
} as const;

/**
 * Default MIME type for unknown file extensions
 */
export const DEFAULT_MIME_TYPE = "application/octet-stream";

/**
 * MIME types that should be treated as text and can have hot-reload script injected
 */
export const TEXT_MIME_TYPES = new Set([
  "text/html",
  "text/css",
  "text/javascript",
  "text/plain",
  "text/markdown",
  "text/xml",
  "application/json",
  "application/xml",
  "image/svg+xml",
]);

/**
 * MIME types that indicate binary files (should be streamed, not read into memory)
 */
export const BINARY_MIME_TYPES = new Set([
  "application/octet-stream",
  "application/pdf",
  "application/zip",
  "application/x-tar",
  "application/gzip",
  "image/png",
  "image/jpeg",
  "image/gif",
  "image/webp",
  "image/bmp",
  "image/tiff",
  "audio/mpeg",
  "audio/wav",
  "audio/ogg",
  "video/mp4",
  "video/x-msvideo",
  "video/quicktime",
  "font/woff",
  "font/woff2",
  "font/ttf",
  "font/otf",
]);

/**
 * MIME types that can be compressed
 */
export const COMPRESSIBLE_MIME_TYPES = new Set([
  "text/html",
  "text/css",
  "text/javascript",
  "text/plain",
  "text/xml",
  "text/csv",
  "text/markdown",
  "application/json",
  "application/xml",
  "application/javascript",
  "image/svg+xml",
]);

/**
 * Get MIME type for a given file extension
 * @param extension - File extension (e.g., ".html")
 * @param options - MimeTypeOptions to customize behavior
 * @returns {string} MIME type as a string
 * @description
 * This function retrieves the MIME type for a given file extension. It first checks for any custom mappings provided in the options.
 * If no custom mapping is found, it falls back to the default MIME type mappings defined in DEFAULT_MIME_TYPES.
 * If the extension is not found in either, it returns the default MIME type specified in the options or "application/octet-stream" if none is provided.
 */
export const getMimeType = (
  extension: string,
  options: MimeTypeOptions = {},
): string => {
  const { defaultType = DEFAULT_MIME_TYPE, customMappings = {} } = options;

  // Normalize extension (ensure it starts with a dot and is lowercase)
  const normalizedExt = extension.startsWith(".")
    ? extension.toLowerCase()
    : `.${extension.toLowerCase()}`;

  // Check custom mappings first, then default mappings
  return (
    customMappings[normalizedExt] ||
    DEFAULT_MIME_TYPES[normalizedExt] ||
    defaultType
  );
};

/**
 * Check if a MIME type is text-based
 */
export const isTextMimeType = (mimeType: string): boolean =>
  TEXT_MIME_TYPES.has(mimeType) || mimeType.startsWith("text/");

/**
 * Check if a MIME type is binary
 */
export const isBinaryMimeType = (mimeType: string): boolean =>
  BINARY_MIME_TYPES.has(mimeType) ||
  mimeType.startsWith("image/") ||
  mimeType.startsWith("audio/") ||
  mimeType.startsWith("video/") ||
  mimeType.startsWith("font/");

/**
 * Check if a MIME type is compressible
 */
export const isCompressibleMimeType = (mimeType: string): boolean =>
  COMPRESSIBLE_MIME_TYPES.has(mimeType) || mimeType.startsWith("text/");

/**
 * Get file extension from filename
 */
export const getFileExtension = (filename: string): string => {
  const lastDotIndex = filename.lastIndexOf(".");
  if (lastDotIndex === -1 || lastDotIndex === 0) {
    return "";
  }
  return filename.slice(lastDotIndex).toLowerCase();
};

/**
 * Get MIME type from filename
 */
export const getMimeTypeFromFilename = (
  filename: string,
  options: MimeTypeOptions = {},
): string => {
  const extension = getFileExtension(filename);
  return getMimeType(extension, options);
};

/**
 * Create a MIME type registry with custom mappings
 */
export const createMimeTypeRegistry = (
  customMappings: MimeTypeMapping = {},
) => {
  const registry = { ...DEFAULT_MIME_TYPES, ...customMappings };

  return {
    get: (extension: string, defaultType = DEFAULT_MIME_TYPE) =>
      registry[extension.toLowerCase()] || defaultType,

    set: (extension: string, mimeType: string) => {
      registry[extension.toLowerCase()] = mimeType;
    },

    has: (extension: string) => extension.toLowerCase() in registry,

    getAll: () => ({ ...registry }),

    remove: (extension: string) => {
      delete registry[extension.toLowerCase()];
    },
  };
};

/**
 * Common file extensions grouped by category
 */
export const FILE_CATEGORIES = {
  web: [".html", ".htm", ".css", ".js", ".mjs", ".ts", ".jsx", ".tsx"],
  images: [".png", ".jpg", ".jpeg", ".gif", ".svg", ".ico", ".webp", ".bmp"],
  fonts: [".woff", ".woff2", ".ttf", ".otf", ".eot"],
  documents: [".pdf", ".doc", ".docx", ".xls", ".xlsx", ".ppt", ".pptx"],
  text: [".txt", ".md", ".csv", ".log", ".yaml", ".yml"],
  archives: [".zip", ".rar", ".7z", ".tar", ".gz", ".bz2"],
  audio: [".mp3", ".wav", ".ogg", ".m4a", ".aac", ".flac"],
  video: [".mp4", ".avi", ".mov", ".wmv", ".flv", ".webm", ".mkv"],
} as const;
