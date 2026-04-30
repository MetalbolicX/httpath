import { join, normalize, relative, resolve } from "@std/path";

/**
 * Checks whether a path matches any of the given ignore patterns.
 *
 * Uses both substring inclusion and suffix matching so patterns like
 * `"node_modules"` or `".git"` work against both full paths and filenames.
 *
 * @param path - The path (or filename) to test
 * @param patterns - Array of patterns to match against
 * @returns `true` if the path matches any pattern
 *
 * @example
 * ```typescript
 * matchesPattern("src/node_modules/foo.js", ["node_modules"]); // true
 * matchesPattern("src/app.ts", [".git", "node_modules"]);      // false
 * ```
 */
export const matchesPattern = (
  path: string,
  patterns: string[],
): boolean =>
  patterns.some(
    (pattern) => path.includes(pattern) || path.endsWith(pattern),
  );

/**
 * Resolves a safe file path by validating it stays within a base directory.
 *
 * Prevents directory traversal attacks by ensuring the resolved path does not
 * escape outside the specified base directory using relative path validation.
 *
 * @param baseDir - The base directory path to constrain resolution within
 * @param requestPath - The requested file path to resolve relative to baseDir
 * @returns The safely resolved absolute path, or null if the path attempts to
 *          escape the base directory or if an error occurs during resolution
 *
 * @example
 * ```typescript
 * // Returns the safe resolved path
 * resolveSafePath('/home/user/files', './document.txt');
 * // Returns: '/home/user/files/document.txt'
 *
 * // Returns null when attempting directory traversal
 * resolveSafePath('/home/user/files', '../../../etc/passwd');
 * // Returns: null
 * ```
 */
export const resolveSafePath = (
  baseDir: string,
  requestPath: string,
): string | null => {
  try {
    const resolvedBase = resolve(baseDir);
    const fullPath = join(resolvedBase, normalize(requestPath));
    const resolvedPath = resolve(fullPath);

    const rel = relative(resolvedBase, resolvedPath);
    if (
      rel.startsWith("..") ||
      (rel === "" && resolvedPath !== resolvedBase)
    ) {
      return null;
    }

    return resolvedPath;
  } catch {
    return null;
  }
};
