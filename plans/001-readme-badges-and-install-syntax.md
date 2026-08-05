# Plan 001: Correct README Node/ReScript badges and run/install syntax

> **Executor instructions**: Follow step by step. Run every verification command
> and confirm the expected result before moving on. On a STOP condition, stop and
> report — do not improvise. Update `plans/README.md` status row when done.
>
> **Drift check (run first)**: `git diff --stat 1b74c20..HEAD -- README.md`
> If README changed since this plan was written, compare excerpts below to live
> code before proceeding; on mismatch, STOP.

## Status

- **Priority**: P1 | **Effort**: S | **Risk**: LOW
- **Depends on**: none
- **Category**: docs
- **Methodology**: `[Basic]` — single-file doc correction matching already-correct `package.json`; no logic, no new tests.
- **Planned at**: commit `1b74c20`, 2026-08-05

## Why this matters

Users read the README before installing; wrong Node/ReScript badges and a
`pnpm @scope/pkg` invocation that pnpm rejects cause install-time failures and
support noise the day this is published.

## Current state

- `README.md:8` — badge `node->=18-brightgreen`. **Wrong**: `package.json:10`
  declares `"node": ">=22"`.
- `README.md:9` — badge `rescript-11-blue`. **Wrong**: `package.json:32`
  declares `rescript: ^12.3.0`.
- `README.md:41` — `pnpm @metalbolicx/httpath` — not valid pnpm syntax.
- `README.md:44` — `pnpm install -g @metalbolicx/httpath` — keep.
- `README.md:57`, `README.md:60`, `README.md:63` — `pnpm @metalbolicx/httpath ...`
  — replace with `npx @metalbolicx/httpath ...` or `pnpm dlx @metalbolicx/httpath ...`.

## Commands you will need

| Purpose | Command | Expected on success |
|---------|---------|----------------------|
| Build (smoke) | `pnpm run build` | exit 0 |
| Docs lint | `npx --yes markdown-link-check README.md` (optional) | exit 0 |

## Scope

**In scope**: `README.md` only.
**Out of scope**: `package.json` (already correct), any source file, the
comparison table on lines 22–30.

## Steps

### Step 1: Fix Node badge
Change `README.md:8` from `node->=18-brightgreen` to `node->=22-brightgreen`.
**Verify**: `grep -n "node->=" README.md` → only the `>=22` line.

### Step 2: Fix ReScript badge
Change `README.md:9` from `rescript-11-blue` to `rescript-12-blue`.
**Verify**: `grep -n "rescript-" README.md` → only the `12` line.

### Step 3: Fix run/install syntax
Replace every `pnpm @metalbolicx/httpath` occurrence with
`npx @metalbolicx/httpath` (lines 41, 57, 60, 63). Keep a globa-install example
using `pnpm install -g` as well.
**Verify**: `grep -n "pnpm @metalbolicx" README.md` → no matches;
`grep -n "npx @metalbolicx" README.md` → ≥3 matches.

## Done criteria

- [ ] `grep "node->=18" README.md` returns nothing.
- [ ] `grep "rescript-11" README.md` returns nothing.
- [ ] `grep "pnpm @metalbolicx" README.md` returns nothing.
- [ ] `pnpm run build` exits 0.
- [ ] Only `README.md` modified (`git status --short`).
- [ ] `plans/README.md` row 001 set to DONE.

## STOP conditions

- The badge lines or install lines don't match the excerpts above (drift).
- A different `pnpm @metalbolicx/...` occurrence exists elsewhere that needs a
  different rewrite — report it instead of guessing.