import { defineConfig } from "rolldown";

export default defineConfig({
  input: "bin.mjs",
  output: {
    dir: "dist",
    entryFileNames: "httpath.mjs",
    format: "esm",
  },
  platform: "node",
  external: [
    "node:fs", "node:fs/promises", "node:path", "node:http",
    "node:child_process", "node:crypto", "node:net", "node:url",
    "node:events", "node:stream", "node:util", "node:buffer",
    "node:os", "node:assert",
    "fs", "path", "http", "child_process", "crypto", "net",
    "url", "events", "stream", "util", "buffer", "os", "assert",
  ],
});
