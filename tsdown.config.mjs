import { defineConfig } from "tsdown";

export default defineConfig({
  entry: "./src/index.mts",
  format: ["cjs", "esm"],
  platform: "node",
  minify: true,
  dts: true,
  tsconfig: true,
  outDir: "./dist",
  fixedExtension: true,
  bundle: true,
  splitting: false,
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
  onSuccess: async () => {
    console.log("✅ Build completed successfully!");
  },
});
