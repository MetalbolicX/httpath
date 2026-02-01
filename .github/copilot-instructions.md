# Copilot Instructions for HTTPath

This file gives concise, actionable guidance for AI coding agents working on this repository.

- **Big picture**: HTTPath is a minimal static file server with hot-reload. The runtime is built from ESM TypeScript `.mts` sources (in `src/`) and compiled to `dist/` via `tsdown` (`npm run build`). The CLI runner is produced at `dist/index.mjs` and orchestrates services from `src/index.mts`.

- **Key components & where to look**:
  - Entry / orchestration: `src/index.mts` (exports `main`, `createHTTPServer`, `VERSION_INFO`).
  - CLI parsing & config: `src/config/cli.mts` (flags: `--port`, `--path`, `--reload`).
  - HTTP handling: `src/services/server.mts` (request routing, `/__reload__` SSE endpoint, graceful shutdown).
  - File I/O & directory listing: `src/services/file-service.mts` (streaming, `generateDirectoryListing`, template injection of reload script).
  - Hot-reload: `src/services/hot-reload.mts` (SSE logic and injectScript usage).
  - Security: `src/security/path-validator.mts` (path normalization, blocked patterns, `DANGEROUS_EXTENSIONS` and `PROTECTED_DIRECTORIES`).
  - Utilities: `src/utils/*` (logger, port finder, `result-pattern` helpers).

- **Architecture notes / why things are structured this way**:
  - Result-oriented error handling: many modules use a `Result<T>` pattern with `isSuccess`, `tryCatch`, `mapTo*Error` helpers. Follow this pattern when adding code: return Result-wrapped values and use existing mapping helpers.
  - Single-threaded streaming model: files are streamed with Node `fs` streams in `file-service.mts`; text files (HTML) are sometimes read into buffers to allow injectScript on hot-reload.
  - Hot-reload uses SSE at `/__reload__` and HTML injection. Any template or HTML-handling changes must preserve injection points and content-length header adjustments as done in `server.mts`.

- **Developer workflows / commands** (defined in `package.json`):
  - `npm run build` — build using `tsdown` (produces `dist/`).
  - `npm run start` — run built server: `node ./dist/index.mjs`.
  - `npm run dev` — run built server with `--reload` flag via the `start` script.
  - `npm run serve` — shorthand: `node ./dist/index.mjs --port 3000 --path .`.
  - `npm test` — runs `node test-server.mjs` (project test harness).

- **Project-specific conventions** (follow these exactly):
  - File extensions: use `.mts` for ESM TypeScript source files and target `dist/*.mjs` outputs.
  - Error handling: use `tryCatch`, `tryCatchAsync`, and `Result` utilities from `src/utils/result-pattern.mts`. Do not throw raw errors across module boundaries when a Result pattern exists.
  - Logging: use `createLogger()` from `src/utils/logger.mts` rather than console.log for consistency.
  - Security: always validate external paths with `validatePath()` in `src/security/path-validator.mts` before file system access.
  - Hot-reload: prefer `HotReloadService.injectScript()` for HTML responses rather than manual injection.

- **Integration points & external dependencies**:
  - Build tool: `tsdown` (devDependency) — used by `npm run build`.
  - Node.js native modules: `node:http`, `node:fs`, `node:path`, `node:util` — code expects Node >=18 (see README).
  - No runtime third-party dependencies in `package.json` — contributions should avoid adding heavy runtime deps unless necessary.

- **Examples (how to implement common tasks)**:
  - Add a new server route that streams a generated file: follow `handleFileRequest()` in `src/services/server.mts` — create or reuse `file-service` helpers and return `Result` objects.
  - Add a CLI flag: update `CLI_OPTIONS` in `src/config/cli.mts`, update help text `HELP_TEXT`, and consume the value in `src/index.mts` or where config merging occurs.
  - Introduce a new error type: add mapping in `src/utils/result-pattern.mts` and use `mapTo*Error` helpers when wrapping try/catch blocks.

- **What to avoid / gotchas**:
  - Do not bypass `validatePath()` — path traversal and platform differences are explicitly guarded in `path-validator.mts`.
  - When modifying HTML responses, always recalc `Content-Length` after injection (see `server.mts` lines that recompute Buffer.byteLength).
  - Keep server binary output stable: `src/index.mts` is the authoritative CLI entry; tests and `test-server.mjs` rely on the built `dist/index.mjs` behavior.

If any of these sections are unclear or you want more detailed examples (unit test patterns, `result-pattern` shape, or hot-reload internals), tell me which area to expand and I will update this file.
