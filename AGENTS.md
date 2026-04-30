**Quick facts**

- This is a Deno-first project. Use the tasks in `deno.json` (do not assume
  npm/node unless you intentionally add packaging).
- Entrypoint: `httpath.ts` (also set as `exports` in `deno.json`). Sources under
  `src/`, tests under `tests/`, demo files under `demo/`.

**Important commands (exact)**

- Dev (recommended):
  - `deno task dev`
  - This runs: `deno run -RN --allow-run --sloppy-imports httpath.ts` (the flags
    are significant — see below).
- Pass runtime args to the task using `--`. Example:
  `deno task dev -- -d demo -p 8080` (the `--` is required to forward args).
- Run tests: `deno task test` (same as `deno test`). Single file:
  `deno test tests/parser.test.ts`. Filter by test name:
  `deno test --filter '<substring>'`.
- Format / lint: `deno task fmt`, `deno task lint`.

**Permissions & runtime flags — don't change lightly**

- The dev task and the script shebang include flags intended for the
  watcher/reloader and child-process restarts. The dev task string in
  `deno.json` is:
  - `deno run -RN --allow-run --sloppy-imports httpath.ts`
- The watcher spawns child Deno processes (see `src/watcher/monitor.mts`) with
  these args:
  - `args: ["run", "-NR", "--allow-run", "--sloppy-imports", script, ...Deno.args]`
- The watcher relies on the spawned process having `--allow-run` (it uses
  `Deno.Command` / `Deno.execPath()` to restart). If you change flags in
  `deno.json`, update `src/watcher/monitor.mts` to keep the restart behavior
  consistent.

**CLI behaviour worth knowing**

- Default directory served is the current working directory (see
  `src/cli/parser.mts` — `DEFAULT_CONFIG.directory` is `Deno.cwd()`).
- Common CLI flags (from `src/cli/parser.mts`): `-d,--dir`, `-p,--port`,
  `-i,--ignore`, `--no-listing`, `--no-live-reload`, `-r,--restart-on-change`,
  `--log`.

**Tests & environment**

- Tests use Deno's test runner and `@std/assert`. They do not require extra
  network permissions in current code; run them with
  `deno test`/`deno task test` from the repo root.
- Many tests inspect file-extension-based reload logic; running tests from a
  different CWD may change expectations because defaults use `Deno.cwd()`.

**Demo / build: stale docs warning**

- `demo/README.md` mentions `npm run build` and `node ../dist/index.mjs`. There
  is no `package.json` in this repo — that part of the demo is stale.
- There is a `tsdown.config.mjs` present for producing a Node `dist/` bundle if
  you choose to add a Node build pipeline. This is optional and currently unused
  by the Deno workflow.

**Module / file conventions**

- The repo uses `.mts` for ESM-style TypeScript modules alongside `.ts`. Do not
  silently convert `.mts` files to CommonJS or rename extensions — Deno relies
  on the extension to infer module type.
- The project keeps a `deno.lock`. Do not hand-edit it; update with `deno cache`
  / `deno` commands as usual.

**Where to look first (high-signal files)**

- `deno.json` — authoritative tasks and imports map.
- `httpath.ts` — shebang + main entry (signal handling, startup orchestration).
- `src/watcher/monitor.mts` — file-watching and restart spawn logic (critical
  when changing flags).
- `src/cli/parser.mts` — CLI options and defaults.
- `deno.lock` — pinned std versions.

**Common gotchas**

- Don't run `npm run build` — there's no package.json; the Deno tasks are the
  real entrypoints.
- If you change the run flags or how the app is started, update both the dev
  task and `src/watcher/monitor.mts` (they must remain aligned for restarts to
  work).
- If you want to run the script via `./httpath.ts`, make sure the file is
  executable (or run with `deno run ... httpath.ts`).
