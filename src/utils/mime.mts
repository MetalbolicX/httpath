import { contentType } from "@std/media-types";
import { extname } from "@std/path";

/**
 * Returns the MIME type of a file based on its extension.
 * @param filePath - The file path.
 * @returns The MIME type or "application/octet-stream" if not found.
 */
export const getMimeType = (filePath: string): string =>
  contentType(extname(filePath).replace(/^\./, "")) ||
  "application/octet-stream";
