# Plan 002: Prune non-runtime files from the published tarball

> **Executor instructions**: Follow step by step. Verify each step. On a STOP
> condition, stop and report. Update `plans/README.md` status row when done.
>
> **Drift check**: `git diff --stat 1b74c20..HEAD -- package.json .npmignore`

## Status

- **Priority**: P1 | **Effort**: S | **Risk**: LOW
- **Depends on**: none
- **Category**: tech-debt (packaging)
- **Methodology**: `[Basic]` — pruning the `files` allowlist is config-only; `npm pack --dry-run` is the verification.
- **Planned at**: commit `1b74c20`, 2026-08-05

## Why this matters

`bin.mjs` is a Rolldown *input*; it imports `./src/Httpath.res.mjs`, but `src/`
is not in `files`, so a published `bin.mjs` is dead weight that would throw
`MODULE_NOT_FOUND` if run directly. `rescript.json` is a compiler config a
consumer cannot use. Shipping them balloons and confuses the tarball.

## Current state

- `package.json:12-19` — `files`: `["dist/", "bin.mjs", "rescript.json",
  "package.json", "README.md", "LICENSE"]`.
- `package.json:7` — `"bin": { "httpath": "./dist/httpath.mjs" }` (correct).
- `bin.mjs:5` — `import { Httpath } from "./src/Httpath.res.mjs"` — only valid
  at build time, not in the published package.
- `.npmignore:96` lists bare `dist` — harmless while `files` wins, but a latent
  footgun; remove it so nobody later "fixes" the wrong way.

## Commands you will need

| Purpose | Command | Expected |
|---------|---------|----------|
| Pack preview | `npm pack --dry-run --ignore-scripts` | exit 0, no `bin.mjs`/`rescript.json` |
| Build | `pnpm run build` | exit 0, produces `dist/httpath.mjs` |

## Scope

**In scope**: `package.json` (the `files` array), `.npmignore` (the `dist` line).
**Out of scope**: `bin.mjs` (still needed as the Rolldown input),
`rolldown.config.mjs`, `dist/`.

## Steps

### Step 1: Remove `bin.mjs` and `rescript.json` from `files`
Edit `package.json:12-19` to keep only `dist/`, `package.json`, `README.md`,
`LICENSE`.
**Verify**: `node -e "console.log(require('./package.json').files)"` → prints
without `bin.mjs` or `rescript.json`.

### Step 2: Remove the bare `dist` line from `.npmignore`
Delete the line containing bare `dist` (`.npmignore:96`).
**Verify**: `grep -n "^dist$" .npmignore` → no matches.

### Step 3: Confirm pack output
Run `npm pack --dry-run --ignore-scripts`. Confirm the file list is exactly:
`LICENSE`, `README.md`, `dist/httpath.mjs`, `package.json`.
**Verify**: the `Tarball Contents` block shows those four and nothing else.

## Done criteria

- [ ] `npm pack --dry-run --ignore-scripts` lists no `bin.mjs` or `rescript.json`.
- [ ] `pnpm run build` exits 0 and `dist/httpath.mjs` exists.
- [ ] `./node_modules/.bin/httpath --version` (or `node dist/httpath.mjs
  --help`) runs from the bund- — this is `bin`, unchanged. Confirm no behavior
  regression by running `node dist/httpath.mjs --help` once.
- [ ] Only `package.json` and `.npmignore` modified.
- [ ] `plans/README.md` row 002 set to DONE.

## STOP conditions

- `npm pack --dry-run --ignore-scripts` fails or reports extra/missing files.
- `dist/httpath.mjs` is not produced by `pnpm run build`.