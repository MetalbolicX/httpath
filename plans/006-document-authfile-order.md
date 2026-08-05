# Plan 006: Document `--auth-file` search order to match implementation

> **Executor instructions**: Follow step by step, verify, update
> `plans/README.md` when done. On a STOP condition, stop and report.
>
> **Drift check**: `git diff --stat 1b74c20..HEAD -- README.md src/Auth/Basic.res`

## Status

- **Priority**: P2 | **Effort**: S | **Risk**: LOW
- **Depends on**: none
- **Category**: docs
- **Methodology**: `[Basic]` — doc-only correction to match already-correct
  code behavior; no logic change.
- **Planned at**: commit `1b74c20`, 2026-08-05

## Why this matters

The historical verify report flagged a README claim that `--auth-file <path>` is
search order #1, which the code used to ignore. The code now honors it
(`Basic.res:204-231`), but the README text should state the precise three-level
order so users don't misconfigure auth.

## Current state

- `src/Auth/Basic.res:204-231` — `searchAuthFile(~explicitPath, ~directory)`:
  when `explicitPath = Some(p)`, search `[p, <directory>/.httpath-auth,
  ~/.config/httpath/auth]`; else `[<directory>/.httpath-auth,
  ~/.config/httpath/auth]`. First parseable file wins.
- `README.md` — around the LAN Security section (currently ~line 220; verify the
  exact line before editing) documents the search order. Confirm it lists the
  explicit `--auth-file` path FIRST, then cwd/served-dir, then the home config.
  If it omits the explicit-path branch or orders them wrong, fix it.

## Commands you will need

| Purpose | Command | Expected |
|---------|---------|----------|
| Build smoke | `pnpm run build` | exit 0 |

## Scope

**In scope**: `README.md` (the `--auth-file` / search-order paragraph only).
**Out of scope**: `src/Auth/Basic.res` (already correct), `package.json`.

## Steps

### Step 1: Locate and read the search-order text
Find the `--auth-file` paragraph in `README.md`.
**Verify**: `grep -n "auth-file\|httpath-auth\|search order" README.md` shows
the relevant lines; note the exact line numbers.

### Step 2: Rewrite to match the implementation
State the order exactly as implemented:
1. The path given to `--auth-file <path>` (if provided).
2. `<served-directory>/.httpath-auth`.
3. `~/.config/httpath/auth`.
First existing, parseable file wins; if none is found and `--lan` is on
without `--no-auth`, startup refuses (point at `scripts/gen-auth.mjs`).
**Verify**: the rewritten text lists all three sources in that order and
matches the code excerpt above.

### Step 3: Build smoke
**Verify**: `pnpm run build` → exit 0.

## Done criteria

- [ ] README documents all three sources in the implemented order.
- [ ] `pnpm run build` exits 0.
- [ ] Only `README.md` modified.
- [ ] `plans/README.md` row 006 set to DONE.

## STOP conditions

- The code at `Basic.res:204-231` no longer matches the excerpt (drift) — align
  the doc to the live code, don't assert a removed ordering.
- The README already matches perfectly — close the plan as DONE noting no edit
  was required.