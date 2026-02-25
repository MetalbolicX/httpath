import { contentType } from "@std/media-types";

/**
 * Returns the MIME type of a file based on its extension.
 * @param filePath - The file path.
 * @returns The MIME type or "application/octet-stream" if not found.
 */
export const getMimeType = (filePath: string): string =>
    contentType(filePath.split(".").at(-1) || "") || "application/octet-stream";
