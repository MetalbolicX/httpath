// File system operations service
import { readdir, stat, readFile, access } from "node:fs/promises";
import { createReadStream } from "node:fs";
import { join, extname } from "node:path";
import type {
  FileEntry,
  DirectoryListingOptions,
  TemplateData,
  TemplateOptions,
  Result,
} from "../types/index.mjs";
import {
  getMimeTypeFromFilename,
  isTextMimeType,
} from "../constants/mime-types.mjs";
import {
  success,
  failure,
  tryCatchAsync,
  mapToFileSystemError,
} from "../utils/result-pattern.mjs";

/**
 * Default directory listing options
 */
export const DEFAULT_LISTING_OPTIONS: Required<DirectoryListingOptions> = {
  showHidden: false,
  sortBy: "name",
  sortOrder: "asc",
};

/**
 * Default template options
 */
export const DEFAULT_TEMPLATE_OPTIONS: Required<TemplateOptions> = {
  customCSS: "",
  customJS: "",
  favicon:
    'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><text y=".9em" font-size="90">📁</text></svg>',
  theme: "auto",
};

/**
 * Read directory entries with options
 * @param dirPath - Directory path to read
 * @param options - Directory listing options
 * @returns Result containing array of FileEntry or error
 * @description
 * This function reads the contents of a directory specified by dirPath.
 * It applies the provided options to filter and sort the entries. Hidden files can be excluded based on the showHidden option.
 * The entries are sorted according to the sortBy and sortOrder options.
 * The function returns a Result type containing either the array of FileEntry objects or an error if the operation fails.
 */
export const readDirectoryEntries = async (
  dirPath: string,
  options: DirectoryListingOptions = {},
): Promise<Result<FileEntry[]>> => {
  const opts = { ...DEFAULT_LISTING_OPTIONS, ...options };

  const entriesResult = await tryCatchAsync(
    () => readdir(dirPath),
    mapToFileSystemError,
  );

  if (!entriesResult.success) {
    return failure(entriesResult.error);
  }

  let files: FileEntry[] = [];

  for (const entry of entriesResult.data) {
    // Skip hidden files if not allowed
    if (!opts.showHidden && entry.startsWith(".")) {
      continue;
    }

    const fullPath = join(dirPath, entry);
    const statsResult = await tryCatchAsync(
      () => stat(fullPath),
      mapToFileSystemError,
    );

    if (statsResult.success) {
      files = [
        ...files,
        {
          name: entry,
          isDir: statsResult.data.isDirectory(),
          size: statsResult.data.size,
          lastModified: statsResult.data.mtime,
        },
      ];
    } else {
      // Skip files that can't be accessed
      console.warn(`Warning: Cannot access file ${entry}:`, statsResult.error);
    }
  }

  // Sort files
  files.sort((a, b) => {
    // Always show directories first
    if (a.isDir && !b.isDir) return -1;
    if (!a.isDir && b.isDir) return 1;

    let compareValue = 0;
    switch (opts.sortBy) {
      case "size":
        compareValue = (a.size || 0) - (b.size || 0);
        break;
      case "date":
        compareValue =
          (a.lastModified?.getTime() || 0) - (b.lastModified?.getTime() || 0);
        break;
      case "name":
      default:
        compareValue = a.name.localeCompare(b.name);
        break;
    }

    return opts.sortOrder === "desc" ? -compareValue : compareValue;
  });

  return success(files);
};

/**
 * Generate directory listing HTML
 * @param dirPath - Directory path on the file system
 * @param urlPath - URL path for links
 * @param options - Directory listing and template options
 * @returns Result containing rendered HTML or error
 * @description
 * This function generates an HTML directory listing for the specified dirPath.
 * It reads the directory entries, applies the provided options for filtering and sorting,
 * and renders the template with the given options. If reading the directory fails, it returns an error template.
 */
export const generateDirectoryListing = async (
  dirPath: string,
  urlPath: string,
  options: DirectoryListingOptions & TemplateOptions = {},
): Promise<Result<string>> => {
  const listingOpts = { ...DEFAULT_LISTING_OPTIONS, ...options };
  const templateOpts = { ...DEFAULT_TEMPLATE_OPTIONS, ...options };

  const filesResult = await readDirectoryEntries(dirPath, listingOpts);

  if (!filesResult.success) {
    const errorTemplate = renderErrorTemplate(
      "Error reading directory",
      filesResult.error.message,
    );
    return success(errorTemplate);
  }

  const templateData: TemplateData = {
    title: `Directory listing for ${urlPath}`,
    path: urlPath,
    files: filesResult.data,
    parentPath: urlPath !== "/" ? getParentPath(urlPath) : undefined,
    serverInfo: {
      name: "HTTPath",
      version: "0.1.0",
      uptime: process.uptime(),
    },
  };

  const template = renderDirectoryTemplate(templateData, templateOpts);
  return success(template);
};

/**
 * Get parent path from URL path
 * @param urlPath - URL path
 * @returns Parent URL path
 * @description
 * This function takes a URL path as input and returns the parent path.
 * It splits the path into segments, removes the last segment, and joins the remaining segments back together.
 * If the resulting path is empty, it returns the root path ("/").
 */
const getParentPath = (urlPath: string): string => {
  const segments = urlPath.split("/").filter((segment) => segment);
  segments.pop();
  return segments.length > 0 ? "/" + segments.join("/") : "/";
};

/**
 * Format file size for display
 * @param bytes - File size in bytes
 * @returns Formatted file size string
 * @description
 * This function takes a file size in bytes and converts it into a human-readable string format.
 * It uses appropriate units (B, KB, MB, GB, TB) based on the size and formats the number to one decimal place for sizes larger than bytes.
 */
const formatFileSize = (bytes: number): string => {
  if (bytes === 0) return "0 B";

  const sizes = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));

  return `${(bytes / Math.pow(1024, i)).toFixed(i === 0 ? 0 : 1)} ${sizes[i]}`;
};

/**
 * Format date for display
 * @param date - Date object
 * @returns Formatted date string
 */
const formatDate = (date: Date): string =>
  date.toLocaleString("en-US", {
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });

/**
 * Get file icon based on file type
 * @param file - FileEntry object
 * @returns File icon string
 * @description
 * This function returns an appropriate icon string based on the file type.
 * It checks the file extension and maps it to a corresponding icon.
 * If the file is a directory, it returns a folder icon.
 * For unrecognized file types, it returns a generic file icon.
 */
const getFileIcon = (file: FileEntry): string => {
  if (file.isDir) return "📁";

  const extension = extname(file.name).toLowerCase();
  const iconMap: Record<string, string> = {
    ".html": "🌐",
    ".htm": "🌐",
    ".css": "🎨",
    ".js": "⚡",
    ".mjs": "⚡",
    ".ts": "📘",
    ".jsx": "⚛️",
    ".tsx": "⚛️",
    ".json": "📋",
    ".xml": "📋",
    ".txt": "📄",
    ".md": "📝",
    ".pdf": "📕",
    ".doc": "📘",
    ".docx": "📘",
    ".xls": "📗",
    ".xlsx": "📗",
    ".png": "🖼️",
    ".jpg": "🖼️",
    ".jpeg": "🖼️",
    ".gif": "🖼️",
    ".svg": "🎨",
    ".mp3": "🎵",
    ".wav": "🎵",
    ".mp4": "🎬",
    ".avi": "🎬",
    ".zip": "📦",
    ".tar": "📦",
    ".gz": "📦",
  };

  return iconMap[extension] || "📄";
};

/**
 * Render directory listing template
 * @param data - Template data
 * @param options - Template options
 * @returns Rendered HTML template string
 * @description
 * This function generates an HTML template for the directory listing page.
 * It uses the provided data to populate the title, path, and file entries.
 * The template is styled with CSS and includes options for custom CSS, JS, favicon, and theme.
 */
const renderDirectoryTemplate = (
  data: TemplateData,
  options: TemplateOptions,
): string => {
  const { title, path, files, parentPath } = data;

  const parentLink = parentPath
    ? /*html*/ `<tr><td><a href="${parentPath}" class="parent-link">📁 ..</a></td><td>-</td><td>-</td></tr>`
    : "";

  const fileRows = files
    .map((file) => {
      const href = join(path, file.name).replace(/\\/g, "/");
      const displayName = file.isDir ? `${file.name}/` : file.name;
      const icon = getFileIcon(file);
      const size = file.isDir ? "-" : formatFileSize(file.size || 0);
      const date = file.lastModified ? formatDate(file.lastModified) : "-";

      return /*html*/ `
      <tr>
        <td><a href="${href}" class="${file.isDir ? "directory" : "file"}">${icon} ${displayName}</a></td>
        <td>${size}</td>
        <td>${date}</td>
      </tr>`;
    })
    .join("");

  const themeClass =
    options.theme === "dark"
      ? "theme-dark"
      : options.theme === "light"
        ? "theme-light"
        : "";

  return /*html*/ `
<!DOCTYPE html>
<html lang="en" class="${themeClass}">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${title}</title>
    <link rel="icon" href="${options.favicon}">
    <style>
        :root {
            --bg-color: #ffffff;
            --text-color: #333333;
            --border-color: #e1e5e9;
            --hover-color: #f8f9fa;
            --link-color: #0066cc;
            --header-bg: #f8f9fa;
        }

        .theme-dark {
            --bg-color: #1a1a1a;
            --text-color: #e1e1e1;
            --border-color: #333333;
            --hover-color: #2a2a2a;
            --link-color: #4da6ff;
            --header-bg: #2a2a2a;
        }

        @media (prefers-color-scheme: dark) {
            :root {
                --bg-color: #1a1a1a;
                --text-color: #e1e1e1;
                --border-color: #333333;
                --hover-color: #2a2a2a;
                --link-color: #4da6ff;
                --header-bg: #2a2a2a;
            }
        }

        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            line-height: 1.6;
            margin: 0;
            padding: 20px;
            background-color: var(--bg-color);
            color: var(--text-color);
        }

        .container {
            max-width: 1200px;
            margin: 0 auto;
        }

        h1 {
            border-bottom: 2px solid var(--border-color);
            padding-bottom: 10px;
            margin-bottom: 20px;
            display: flex;
            align-items: center;
            gap: 10px;
        }

        .breadcrumb {
            font-size: 0.9em;
            color: var(--link-color);
            margin-bottom: 15px;
        }

        .breadcrumb a {
            color: var(--link-color);
            text-decoration: none;
        }

        .breadcrumb a:hover {
            text-decoration: underline;
        }

        table {
            width: 100%;
            border-collapse: collapse;
            margin-bottom: 20px;
            background: var(--bg-color);
            border-radius: 8px;
            overflow: hidden;
            box-shadow: 0 2px 4px rgba(0,0,0,0.1);
        }

        th {
            background-color: var(--header-bg);
            padding: 12px 15px;
            text-align: left;
            font-weight: 600;
            border-bottom: 1px solid var(--border-color);
        }

        td {
            padding: 10px 15px;
            border-bottom: 1px solid var(--border-color);
        }

        tr:hover {
            background-color: var(--hover-color);
        }

        tr:last-child td {
            border-bottom: none;
        }

        a {
            color: var(--link-color);
            text-decoration: none;
            display: flex;
            align-items: center;
            gap: 8px;
        }

        a:hover {
            text-decoration: underline;
        }

        .parent-link {
            font-weight: 600;
            opacity: 0.8;
        }

        .directory {
            font-weight: 500;
        }

        .footer {
            margin-top: 30px;
            padding-top: 20px;
            border-top: 1px solid var(--border-color);
            text-align: center;
            color: var(--text-color);
            opacity: 0.7;
            font-size: 0.9em;
        }

        .stats {
            display: flex;
            justify-content: space-between;
            margin-bottom: 20px;
            font-size: 0.9em;
            color: var(--text-color);
            opacity: 0.8;
        }

        @media (max-width: 768px) {
            body {
                padding: 10px;
            }

            table {
                font-size: 0.9em;
            }

            .stats {
                flex-direction: column;
                gap: 5px;
            }
        }

        ${options.customCSS}
    </style>
</head>
<body>
    <div class="container">
        <h1>📁 Directory listing for ${path}</h1>

        <div class="stats">
            <span>${files.length} items</span>
            <span>Served by HTTPath v${data.serverInfo?.version}</span>
        </div>

        <table>
            <thead>
                <tr>
                    <th>Name</th>
                    <th>Size</th>
                    <th>Modified</th>
                </tr>
            </thead>
            <tbody>
                ${parentLink}
                ${fileRows}
            </tbody>
        </table>

        <div class="footer">
            <p>HTTPath - A minimalist Node.js file server</p>
        </div>
    </div>

    ${options.customJS ? `<script>${options.customJS}</script>` : ""}
</body>
</html>`;
};

/**
 * Render error template
 * @param title - Error title
 * @param message - Error message
 * @returns Rendered HTML error template string
 */
const renderErrorTemplate = (
  title: string,
  message: string,
): string => /*html*/ `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Error - HTTPath</title>
    <style>
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            display: flex;
            justify-content: center;
            align-items: center;
            min-height: 100vh;
            margin: 0;
            background-color: #f8f9fa;
            color: #333;
        }
        .error-container {
            text-align: center;
            padding: 40px;
            background: white;
            border-radius: 8px;
            box-shadow: 0 2px 10px rgba(0,0,0,0.1);
        }
        .error-icon {
            font-size: 4em;
            margin-bottom: 20px;
        }
        h1 {
            color: #dc3545;
            margin-bottom: 10px;
        }
        p {
            color: #666;
            line-height: 1.6;
        }
    </style>
</head>
<body>
    <div class="error-container">
        <div class="error-icon">❌</div>
        <h1>${title}</h1>
        <p>${message}</p>
    </div>
</body>
</html>`;

/**
 * Check if file exists
 * @param filePath - File path to check
 * @returns Result indicating whether the file exists
 * @description
 * This function checks if a file exists at the specified filePath.
 * It uses the access method from the fs/promises module to verify the file's existence.
 * The function returns a Result type containing a boolean indicating whether the file exists or an error if the operation fails.
 */
export const fileExists = async (
  filePath: string,
): Promise<Result<boolean>> => {
  const result = await tryCatchAsync(
    () => access(filePath),
    mapToFileSystemError,
  );

  return success(result.success);
};

/**
 * Get file statistics
 * @param filePath - File path to get stats for
 * @returns Result containing file statistics or error
 * @description
 * This function retrieves the statistics of a file located at the specified filePath.
 * It uses the stat method from the fs/promises module to obtain file information such as size, modification date, and type.
 * The function returns a Result type containing either the file statistics or an error if the operation fails.
 */
export const getFileStat = async (
  filePath: string,
): Promise<Result<import("fs").Stats>> =>
  await tryCatchAsync(() => stat(filePath), mapToFileSystemError);

/**
 * Read text file content
 * @param filePath - File path to read
 * @returns Result containing file content or error
 * @description
 * This function reads the content of a text file located at the specified filePath.
 * It uses the readFile method from the fs/promises module to read the file as a UTF-8 encoded string.
 * The function returns a Result type containing either the file content or an error if the operation fails.
 */
export const readTextFile = async (filePath: string): Promise<Result<string>> =>
  await tryCatchAsync(() => readFile(filePath, "utf8"), mapToFileSystemError);

/**
 * Create file read stream
 * @param filePath - File path to create stream for
 * @returns Read stream for the specified file
 * @description
 * This function creates a read stream for the file located at the specified filePath.
 * It uses the createReadStream method from the fs module to create a stream that can be used to read the file's content in chunks.
 */
export const createFileStream = (filePath: string) =>
  createReadStream(filePath);

/**
 * Get serving method based on file type
 * @param filePath - File path to determine serving method for
 * @returns Serving method ("stream" or "buffer")
 * @description
 * This function determines the appropriate serving method for a file based on its MIME type.
 * It uses the getMimeTypeFromFilename utility to get the MIME type from the file extension.
 * If the MIME type indicates a text-based file, it returns "buffer" to read the file into memory.
 * For binary files, it returns "stream" to serve the file as a stream.
 */
export const getServingMethod = (filePath: string): "stream" | "buffer" => {
  const mimeType = getMimeTypeFromFilename(filePath);
  return isTextMimeType(mimeType) ? "buffer" : "stream";
};
