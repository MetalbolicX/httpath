# Plan 005: Add CI release gate (build + test + pack dry-run)

> **Executor instructions**: Follow step by step, verify, update
> `plans/README.md` when done. On a STOP condition, stop and report.
>
> **Drift check**: `git diff --stat 1b74c20..HEAD -- .github package.json`

## Status

- **Priority**: P1 | **Effort**: M | **Risk**: LOW
- **Depends on**: 004 (so CI runs the complete integration set)
- **Category**: dx / release
- **Methodology**: `[Basic]` — new CI config file; no source logic; verification
  is the workflow running green.
- **Planned at**: commit `1b74c20`, 2026-08-05

## Why this matters

There is no `.github/` directory — no automated build/test/pack gate. Every
publish is a manual `pnpm publish` whose only safety net is `prepublishOnly`.
A CI gate that reproduces the release checks on every push makes a broken
publish far less likely.

## Current state

- No `.github/` directory exists.
- `package.json` uses pnpm; `engines.node` is `>=22`.
- `package.json:25` — `prepublishOnly` already runs `pnpm run build && pnpm test`.
- `pnpm-lock.yaml` is present.

## Commands you will need

| Purpose | Command | Expected |
|---------|---------|----------|
| Local mirror of CI | `pnpm install --frozen-lockfile && pnpm run build && pnpm test && npm pack --dry-run --ignore-scripts` | exit 0 |

## Scope

**In scope**: `.github/workflows/ci.yml` (new).
**Out of scope**: `package.json` scripts (already correct), any release-publish
workflow (deferred — this plan is only the gate).

## Steps

### Step 1: Create the workflow file
Create `.github/workflows/ci.yml` that, on `push` to `main` and on all PRs:
1. Checks out the repo (no submodules).
2. Sets up pnpm (use `pnpm/action-setup` with the version from
   `packageManager` if present, else `9`).
3. Sets up Node `22` (matches `engines.node`).
4. Runs `pnpm install --frozen-lockfile`.
5. Runs `pnpm run build`.
6. Runs `pnpm test`.
7. Runs `npm pack --dry-run --ignore-scripts` and confirms
   `dist/httpath.mjs` appears in the tarball contents (a grep step).
**Verify**: `npx --yes actionlint .github/workflows/ci.yml` → exit 0 (install
actionlint ad-hoc if needed; OR verify YAML parses with
`node -e "require('js-yaml').load(require('fs').readFileSync('.github/workflows/ci.yml','utf8'))"`
if actionlint is unavailable).

### Step 2: Mirror locally
Run the command block from "Commands you will need" locally.
**Verify**: exit 0 and `npm pack --dry-run` prints `dist/httpath.mjs`.

### Step 3: Commit + push (operator-permitted)
Branch `advisor/005-ci-gate`, commit `ci: add build+test+pack release gate`,
push when the operator allows.
**Verify**: the CI run on the branch is green.

## Done criteria

- [ ] `.github/workflows/ci.yml` exists and validates.
- [ ] Local mirror command exits 0.
- [ ] CI run on the branch is green (if push permitted).
- [ ] `plans/README.md` row 005 set to DONE.

## STOP conditions

- `actionlint`/YAML parse reports a schema error you can't fix without changing
  the job intent — report and align.
- The local mirror fails at a step other than the ones owned by 001–004 — report
  rather than editing source in this plan.