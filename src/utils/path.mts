import { join, normalize, relative, resolve } from "@std/path";

/**
 * Resolves a safe path within a base directory.
 * @param baseDir - The base directory.
 * @param requestPath - The requested path.
 * @returns The resolved path or null if it's outside the base directory.
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
