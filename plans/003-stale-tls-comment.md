# Plan 003: Fix stale TLS comment about cert reuse

> **Executor instructions**: Follow step by step, verify, update
> `plans/README.md` when done. On a STOP condition, stop and report.
>
> **Drift check**: `git diff --stat 1b74c20..HEAD -- src/Security/Tls.res`

## Status

- **Priority**: P2 | **Effort**: S | **Risk**: LOW
- **Depends on**: none
- **Category**: tech-debt (docs/comment)
- **Methodology**: `[Basic]` — comment-only edit; no behavior or tests change.
- **Planned at**: commit `1b74c20`, 2026-08-05

## Why this matters

`Tls.res:109` still says "Overwrites existing files without warning", but lines
`122-129` now reuse an existing cert. A maintainer reading the comment will
either re-introduce the bug or distrust the code — either costs a future
incident.

## Current state

- `src/Security/Tls.res:109` — comment: `// Overwrites existing files without
  warning.` (stale).
- `src/Security/Tls.res:120-129` — `generateSelfSigned` calls `loadExplicitCert`
  and returns early on `Some(pair)` — reuses existing cert/key.

## Commands you will need

| Purpose | Command | Expected |
|---------|---------|----------|
| Build | `pnpm run build` | exit 0 |
| Tests | `pnpm run test:integration` | exit 0 (TLS reuse test passes) |

## Scope

**In scope**: `src/Security/Tls.res` (the single comment at `:109`).
**Out of scope**: any logic, any other comment, the TLS reuse test.

## Steps

### Step 1: Replace the stale comment
Change `src/Security/Tls.res:109` to read:
```
// Reuses an existing cert/key pair at the default location if present;
// only generates a new self-signed cert when none is found (see below).
```
**Verify**: `grep -n "Overwrites existing files" src/Security/Tls.res` → no
matches.

### Step 2: Build + TLS integration test
**Verify**: `pnpm run build && pnpm run test:integration` → exit 0, including
`lan_tls.test.mjs`.

## Done criteria

- [ ] The stale phrase is gone from `Tls.res`.
- [ ] `pnpm run build` exits 0.
- [ ] `pnpm run test:integration` exits 0.
- [ ] Only `src/Security/Tls.res` modified.
- [ ] `plans/README.md` row 003 set to DONE.

## STOP conditions

- Lines `120-129` no longer implement reuse (drift) — report instead of editing
  the comment to match a now-removed behavior.