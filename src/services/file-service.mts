// File system operations service
import { readdir, stat, readFile, access } from "fs/promises";
import { createReadStream } from "fs";
import { join, extname, basename } from "path";
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
 * Read directory contents and return file entries
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

  const files: FileEntry[] = [];

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
      files.push({
        name: entry,
        isDir: statsResult.data.isDirectory(),
        size: statsResult.data.size,
        lastModified: statsResult.data.mtime,
      });
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
 * Generate HTML directory listing
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
 * Get parent path for navigation
 */
const getParentPath = (urlPath: string): string => {
  const segments = urlPath.split("/").filter((segment) => segment);
  segments.pop();
  return segments.length > 0 ? "/" + segments.join("/") : "/";
};

/**
 * Format file size for display
 */
const formatFileSize = (bytes: number): string => {
  if (bytes === 0) return "0 B";

  const sizes = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));

  return `${(bytes / Math.pow(1024, i)).toFixed(i === 0 ? 0 : 1)} ${sizes[i]}`;
};

/**
 * Format date for display
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
 * Get file type icon
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
 * Render directory template
 */
const renderDirectoryTemplate = (
  data: TemplateData,
  options: TemplateOptions,
): string => {
  const { title, path, files, parentPath } = data;

  const parentLink = parentPath
    ? `<tr><td><a href="${parentPath}" class="parent-link">📁 ..</a></td><td>-</td><td>-</td></tr>`
    : "";

  const fileRows = files
    .map((file) => {
      const href = join(path, file.name).replace(/\\/g, "/");
      const displayName = file.isDir ? `${file.name}/` : file.name;
      const icon = getFileIcon(file);
      const size = file.isDir ? "-" : formatFileSize(file.size || 0);
      const date = file.lastModified ? formatDate(file.lastModified) : "-";

      return `
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

  return `
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
 */
const renderErrorTemplate = (title: string, message: string): string =>
  `
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
 * Check if a file exists
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
 * Get file stats safely
 */
export const getFileStat = async (
  filePath: string,
): Promise<Result<import("fs").Stats>> => {
  return await tryCatchAsync(() => stat(filePath), mapToFileSystemError);
};

/**
 * Read file content for text files
 */
export const readTextFile = async (
  filePath: string,
): Promise<Result<string>> => {
  return await tryCatchAsync(
    () => readFile(filePath, "utf8"),
    mapToFileSystemError,
  );
};

/**
 * Create file stream for binary files
 */
export const createFileStream = (filePath: string) =>
  createReadStream(filePath);

/**
 * Get appropriate serving method based on file type
 */
export const getServingMethod = (filePath: string): "stream" | "buffer" => {
  const mimeType = getMimeTypeFromFilename(filePath);
  return isTextMimeType(mimeType) ? "buffer" : "stream";
};
