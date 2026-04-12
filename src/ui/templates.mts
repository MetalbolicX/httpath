import type { FileEntry } from "../types.mts";

/**
 * Escapes HTML special characters in a string to prevent XSS attacks.
 * Converts the following characters to their HTML entity equivalents:
 * - `&` to `&amp;`
 * - `<` to `&lt;`
 * - `>` to `&gt;`
 * - `"` to `&quot;`
 * - `'` to `&#39;`
 *
 * @param s - The string to escape
 * @returns The escaped string with HTML special characters converted to entities
 *
 * @example
 * ```typescript
 * escapeHtml('<script>alert("XSS")</script>')
 * // Returns: '&lt;script&gt;alert(&quot;XSS&quot;)&lt;/script&gt;'
 * ```
 */
export const escapeHtml = (s: string): string =>
  s.replace(/[&<>"']/g, (c) =>
    (
      { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[
        c
      ]
    ) ?? c);

export const getCSSStyles = (): string =>
  /*css*/ `
:root {
  /* Light Theme */
  --bg-body: #f8fafc;
  --bg-surface: #ffffff;
  --text-main: #0f172a;
  --text-muted: #64748b;
  --border-color: #e2e8f0;
  --hover-bg: #f1f5f9;
  --accent-color: #3b82f6;
  --toggle-bg: #cbd5e1;
  --toggle-knob: #ffffff;
  --shadow-sm: 0 1px 2px 0 rgb(0 0 0 / 0.05);
  --shadow-md: 0 4px 6px -1px rgb(0 0 0 / 0.1), 0 2px 4px -2px rgb(0 0 0 / 0.1);
}

:root:has(#dark:checked) {
  /* Dark Theme */
  --bg-body: #0f172a;
  --bg-surface: #1e293b;
  --text-main: #f8fafc;
  --text-muted: #94a3b8;
  --border-color: #334155;
  --hover-bg: #334155;
  --accent-color: #60a5fa;
  --toggle-bg: #3b82f6;
  --toggle-knob: #ffffff;
  --shadow-sm: 0 1px 2px 0 rgb(0 0 0 / 0.3);
  --shadow-md: 0 4px 6px -1px rgb(0 0 0 / 0.3), 0 2px 4px -2px rgb(0 0 0 / 0.3);
}

* {
  box-sizing: border-box;
  margin: 0;
  padding: 0;
}

body {
  font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
  background-color: var(--bg-body);
  color: var(--text-main);
  line-height: 1.5;
  padding: 2rem 1rem;
  transition: background-color 0.3s ease, color 0.3s ease;
}

.container {
  max-width: 800px;
  margin: 0 auto;
  background-color: var(--bg-surface);
  border-radius: 12px;
  border: 1px solid var(--border-color);
  box-shadow: var(--shadow-md);
  overflow: hidden;
  transition: background-color 0.3s ease, border-color 0.3s ease;
}

.header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 1.5rem 2rem;
  border-bottom: 1px solid var(--border-color);
  background-color: var(--bg-surface);
}

.header h1 {
  font-size: 1.25rem;
  font-weight: 600;
  color: var(--text-main);
  word-break: break-all;
}

.header-path {
  color: var(--text-muted);
  font-weight: 400;
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
  font-size: 1rem;
  margin-left: 0.5rem;
}

/* Toggle Switch */
.toggle {
  --width: 46px;
  --height: 24px;

  display: flex;
  align-items: center;
  cursor: pointer;
  flex-shrink: 0;
}

.toggle__input {
  display: none;
}

.toggle__fill {
  position: relative;
  width: var(--width);
  height: var(--height);
  border-radius: 9999px;
  background-color: var(--toggle-bg);
  transition: background-color 0.3s ease;
}

.toggle__fill::after {
  content: "";
  position: absolute;
  top: 2px;
  left: 2px;
  width: 20px;
  height: 20px;
  border-radius: 50%;
  background-color: var(--toggle-knob);
  box-shadow: var(--shadow-sm);
  transition: transform 0.3s cubic-bezier(0.4, 0, 0.2, 1);
}

.toggle__input:checked + .toggle__fill::after {
  transform: translateX(22px);
}

/* File List */
.file-list {
  display: flex;
  flex-direction: column;
  padding: 0.5rem;
}

.file-item {
  display: flex;
  align-items: center;
  padding: 0.75rem 1rem;
  text-decoration: none;
  color: var(--text-main);
  border-radius: 8px;
  transition: background-color 0.2s ease, color 0.2s ease;
}

.file-item:hover {
  background-color: var(--hover-bg);
}

.file-item:hover .file-name {
  color: var(--accent-color);
}

.icon {
  font-size: 1.25rem;
  margin-right: 1rem;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 24px;
}

.file-name {
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
  font-size: 0.95rem;
  transition: color 0.2s ease;
}

.empty-state {
  padding: 3rem;
  text-align: center;
  color: var(--text-muted);
  font-style: italic;
}
`.trim();

/**
 * Generates an HTML page displaying a directory listing.
 *
 * @param entries - Array of file entries to display in the directory listing
 * @param urlPath - The URL path of the current directory
 * @returns A complete HTML document string containing the formatted directory listing
 *
 * @example
 * ```typescript
 * const entries: FileEntry[] = [
 *   { name: 'file.txt', isDirectory: false, url: '/file.txt' },
 *   { name: 'subfolder', isDirectory: true, url: '/subfolder' }
 * ];
 * const html = generateDirectoryListingHTML(entries, '/documents');
 * ```
 *
 * @remarks
 * - Automatically sorts entries with directories first, then alphabetically
 * - Displays a parent directory link (..) for non-root paths
 * - Includes a dark mode toggle in the header
 * - Escapes HTML in file names and URL paths for security
 * - Uses emoji icons (📁 for directories, 📄 for files)
 */
export const generateDirectoryListingHTML = (
  entries: FileEntry[],
  urlPath: string,
): string => {
  const parentDir = urlPath === "/"
    ? ""
    : /*html*/ `<a href="../" class="file-item">
        <span class="icon">📁</span>
        <span class="file-name">..</span>
       </a>`;

  const entryLinks = entries.length === 0
    ? /*html*/ `<div class="empty-state">This directory is empty</div>`
    : entries
      .sort((a, b) => {
        if (a.isDirectory && !b.isDirectory) return -1;
        if (!a.isDirectory && b.isDirectory) return 1;
        return a.name.localeCompare(b.name);
      })
      .map((entry) => {
        const icon = entry.isDirectory ? "📁" : "📄";
        const href = entry.url === "/"
          ? `/${encodeURIComponent(entry.name)}`
          : entry.url;
        return /*html*/ `
            <a href="${href}" class="file-item">
              <span class="icon">${icon}</span>
              <span class="file-name">${escapeHtml(entry.name)}</span>
            </a>
          `;
      })
      .join("");

  const themeToggle = /*html*/ `
    <label class="toggle" for="dark" title="Toggle Dark Mode">
      <input type="checkbox" name="toggle" id="dark" class="toggle__input" checked>
      <span class="toggle__fill"></span>
    </label>
  `;

  return /*html*/ `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Index of ${urlPath}</title>
  <style>
${getCSSStyles()}
  </style>
</head>
<body>
  <div class="container">
    <header class="header">
      <h1>Index of <span class="header-path">${escapeHtml(urlPath)}</span></h1>
      ${themeToggle}
    </header>
    <main class="file-list">
      ${parentDir}
      ${entryLinks}
    </main>
  </div>
</body>
</html>
  `.trim();
};
