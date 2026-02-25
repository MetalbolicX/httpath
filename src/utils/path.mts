import { join, resolve, normalize } from "@std/path";

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
        const normalizedPath = normalize(requestPath);
        const fullPath = join(baseDir, normalizedPath);
        const resolvedPath = resolve(fullPath);
        const resolvedBase = resolve(baseDir);

        if (!resolvedPath.startsWith(resolvedBase)) {
            return null;
        }

        return resolvedPath;
    } catch {
        return null;
    }
};
