**Quick facts**

- This is a **Node + ReScript project**. Use `package.json` scripts. Do not
  assume Deno is available.
- Entrypoint: `bin.mjs` (source for Rolldown) → `dist/httpath.mjs` (Rolldown
  bundle, published via npm).
- Sources under `src/**/*.res`, compiled to `src/**/*.res.mjs` (in-source).
  Tests under `tests/`, demo files under `demo/`.

**Important commands (exact)**

- Dev:
  - `pnpm dev` — runs `rescript build -watch` (ReScript compilation in watch
    mode). Rolldown bundling is done via `pnpm run build`.
- Build (one-shot):
  - `pnpm run build` — runs `rescript && rolldown`. Produces `dist/httpath.mjs`.
- Test:
  - `pnpm test` — runs `pnpm run build && pnpm run test:unit && pnpm run test:integration`.
  - `pnpm run test:unit` — unit tests (ReScript test runner via retest).
  - `pnpm run test:integration` — integration tests (`node --test`).
  - Run a single test file: `pnpm run test:unit -- tests/parser.test.js` (or `.mjs`).
- Format / lint: `pnpm run fmt`, `pnpm run lint`.
- Pass runtime args to dev: `pnpm dev -- -d demo -p 8080` (the `--` is
  required to forward args to the ReScript watch process).

**Node — no permission system**

Node.js has no permission model like Deno's `--allow-*` flags. The `pnpm dev`
command does not need any special permissions; the watcher uses `node:child_process`
to restart itself.

**CLI behaviour worth knowing**

- Default directory served is the current working directory (see
  `src/Cfg/Parser.res` — `DEFAULT_CONFIG.directory` is `process.cwd()`).
- Common CLI flags (from `src/Cfg/Parser.res`): `-d,--dir`, `-p,--port`,
  `-i,--ignore`, `--no-listing`, `--no-live-reload`, `-r,--restart-on-change`,
  `--trust-proxy`, `--allow-protected-dir`, `--log`.

**Tests & environment**

- Unit tests: `pnpm run test:unit`. Uses ReScript's `rescript test` internally
  (backed by `retest`).
- Integration tests: `pnpm run test:integration`. Uses Node's built-in
  `node --test` runner.
- Many tests inspect file-extension-based reload logic; running tests from a
  different CWD may change expectations because defaults use `process.cwd()`.

**Module / file conventions**

- ReScript source: `src/**/*.res`. Compiled output: `src/**/*.res.mjs` (in-source
  compilation, configured in `rescript.json` with `"suffix": ".res.mjs"`).
- Plain ESM helpers: `src/**/*.mjs`.
- Integration test helpers and Node-specific test scripts: `tests/**/*.mjs`.
- Do not silently convert `.res` files to `.ts`/`.mts` — the project is fully
  ReScript.

**Where to look first (high-signal files)**

- `package.json` — authoritative scripts, dependencies, bin entry.
- `rescript.json` — ReScript compiler config.
- `rolldown.config.mjs` — Rolldown bundler config.
- `bin.mjs` — Rolldown input source; imports `Httpath` and calls `main()`.
- `src/Httpath.res` — main entry (signal handling, startup orchestration).
- `src/Cfg/Parser.res` — CLI options and defaults.

**Common gotchas**

- Don't run `deno task ...` — there is no `deno.json`. Use `pnpm run ...`.
- `pnpm run build` triggers both `rescript` (ReScript → `.res.mjs`) and `rolldown`
  (bundling `bin.mjs` → `dist/httpath.mjs`). Both steps are required.
- The `prepare` and `prepublishOnly` scripts in `package.json` run `pnpm run build`,
  so the bundle is always up-to-date before publishing or installing locally.
- The watcher (`src/Watcher/Monitor.res`) spawns child Node processes using
  `process.argv[1]` as the entrypoint — at runtime this is `dist/httpath.mjs`.
- ReScript files compile to `.res.mjs` in the same directory. Imports use the
  `.res` extension (ReScript's convention); the compiler resolves to the
  `.res.mjs` output at build time.
