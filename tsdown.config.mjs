import { defineConfig } from "tsdown";

export default defineConfig({
  entry: "./src/index.mts",
  format: ["cjs", "esm"],
  platform: "node",
  minify: false,
  dts: true,
  tsconfig: true,
  outDir: "./dist",
  fixedExtension: true,
  external: [
    "http",
    "https",
    "fs",
    "fs/promises",
    "path",
    "events",
    "util",
    "net",
    "url",
    "stream",
    "buffer",
    "crypto",
    "os",
  ],
  outputOptions: {
    name: "HTTPath",
  },
});
