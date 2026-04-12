import { contentType } from "@std/media-types";
import { extname } from "@std/path";

/**
 * Gets the MIME type for a given file path.
 * @param filePath - The file path to get the MIME type for
 * @returns The MIME type string for the file, or "application/octet-stream" if the type cannot be determined
 */
export const getMimeType = (filePath: string): string =>
  contentType(extname(filePath).replace(/^\./, "")) ||
  "application/octet-stream";
