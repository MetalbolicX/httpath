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
): boolean => {
  const pathSegments = path.replaceAll("\\", "/").split("/").filter(Boolean);

  return patterns.some((pattern) => {
    const patternSegments = pattern.replaceAll("\\", "/").split("/").filter(Boolean);
    if (patternSegments.length === 0 || patternSegments.length > pathSegments.length) {
      return false;
    }

    return pathSegments.some((_, index) =>
      patternSegments.every((segment, offset) => pathSegments[index + offset] === segment)
    );
  });
};

/**
 * Checks whether any prefix of `targetPath` under `baseDir` is a symlink.
 *
 * The check walks path segments one by one so intermediate symlinks are
 * caught before file reads or directory listings resolve through them.
 */
export const hasSymlinkPrefix = async (
  baseDir: string,
  targetPath: string,
): Promise<boolean> => {
  const resolvedBase = resolve(baseDir);
  const resolvedTarget = resolve(targetPath);
  const rel = relative(resolvedBase, resolvedTarget);

  if (rel.startsWith("..")) return false;

  const segments = rel.split(/[\\/]/).filter(Boolean);
  let current = resolvedBase;

  for (const segment of segments) {
    current = join(current, segment);
    try {
      const info = await Deno.lstat(current);
      if (info.isSymlink) return true;
    } catch (error) {
      if (error instanceof Deno.errors.NotFound) return false;
      throw error;
    }
  }

  return false;
};

// Protected system paths per platform.
// Matching is done against the resolved absolute path with a trailing separator
// so that e.g. "/etc" does NOT match "/etc-custom".
const PROTECTED_PATHS: Record<string, string[]> = {
  linux: [
    "/etc",
    "/bin",
    "/sbin",
    "/boot",
    "/dev",
    "/proc",
    "/sys",
    "/root",
    "/lib",
    "/lib64",
    "/lost+found",
  ],
  darwin: [
    "/etc",
    "/bin",
    "/sbin",
    "/boot",
    "/dev",
    "/proc",
    "/sys",
    "/root",
    "/lib",
    "/lib64",
    "/lost+found",
    "/System",
    "/Library",
    "/private/etc",
  ],
  windows: [
    "C:\\Windows",
    "C:\\WinNT",
    "C:\\Program Files",
    "C:\\Program Files (x86)",
    "C:\\ProgramData",
    "C:\\System Volume Information",
    "C:\\Recovery",
    "C:\\$Recycle.Bin",
    "C:\\PerfLogs",
    "C:\\Documents and Settings",
  ],
};

/**
 * Returns `true` when the given path is, or is inside, a known protected
 * system/OS directory on the current platform.
 *
 * The check is purely path-based (no filesystem access required). Paths are
 * resolved and normalised before comparison; Windows comparisons are
 * case-insensitive. The function returns `false` for any platform that does
 * not have an entry in the blocklist (e.g. "android", future Deno targets).
 *
 * @param dirPath - The absolute path to check (will be resolved internally)
 *
 * @example
 * ```typescript
 * // Linux
 * isProtectedSystemPath("/etc");          // true
 * isProtectedSystemPath("/etc/nginx");    // true
 * isProtectedSystemPath("/etc-custom");   // false
 * isProtectedSystemPath("/home/user");    // false
 *
 * // Windows
 * isProtectedSystemPath("C:\\Windows");   // true
 * isProtectedSystemPath("C:\\Users\\me"); // false
 * ```
 */
export const isProtectedSystemPath = (dirPath: string): boolean => {
  const os = Deno.build.os as string;
  const protectedPaths = PROTECTED_PATHS[os];

  // Unknown platform — don't block
  if (!protectedPaths) return false;

  const isWindows = os === "windows";
  const resolvedDir = resolve(dirPath);

  // Normalise to lowercase on Windows for case-insensitive matching
  const normalised = isWindows ? resolvedDir.toLowerCase() : resolvedDir;

  return protectedPaths.some((protected_) => {
    const normProtected = isWindows ? protected_.toLowerCase() : protected_;
    const sep = isWindows ? "\\" : "/";

    // Exact match OR the path is inside the protected directory
    return (
      normalised === normProtected ||
      normalised.startsWith(normProtected + sep)
    );
  });
};

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
