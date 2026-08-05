# Plan 004: Wire missing integration tests into `test:integration`

> **Executor instructions**: Follow step by step, verify, update
> `plans/README.md` when done. On a STOP condition, stop and report.
>
> **Drift check**: `git diff --stat 1b74c20..HEAD -- package.json tests/integration`

## Status

- **Priority**: P1 | **Effort**: S | **Risk**: MED
- **Depends on**: none
- **Category**: tests
- **Methodology**: `[Basic]` for wiring; the script lists test files explicitly
  today (see `package.json:27`). If a newly-wired test FAILS, STOP and hand off
  to a TDD follow-up rather than rewriting the test here.
- **Planned at**: commit `1b74c20`, 2026-08-05

## Why this matters

`tests/integration/graceful_shutdown.test.js` and
`tests/integration/static_handler.test.js` exist on disk but are NOT in
`test:integration`, so `prepublishOnly` never runs them. A release gate that
silently skips two suites gives false-green publishes.

## Current state

- `package.json:27` — `test:integration` explicitly lists 6 files:
  `ws_hub.test.js`, `entrypoint.test.js`, `lan_auth.test.mjs`,
  `lan_read_only.test.mjs`, `lan_tls.test.mjs`, `lan_e2e.test.mjs`.
- `tests/integration/graceful_shutdown.test.js` and
  `tests/integration/static_handler.test.js` exist but are omitted.

## Commands you will need

| Purpose | Command | Expected |
|---------|---------|----------|
| Integration suite | `pnpm run test:integration` | exit 0, both new files run |
| Full gate | `pnpm test` | exit 0 |

## Scope

**In scope**: `package.json` (the `test:integration` script string only).
**Out of scope**: the bodies of the two test files. If either fails, STOP stays
in effect and a separate TDD plan is opened to repair the test.

排查: do not edit the test files to make them pass.

## Steps

### Step 1: Run the two orphaned tests directly first
Before wiring, run each in isolation to see current status:
`node --test tests/integration/graceful_shutdown.test.js` and
`node --test tests/integration/static_handler.test.js`.
**Verify**: capture the pass/fail state of each.

### Step 2: Add them to the script
Append both file paths to the `test:integration` value in `package.json:27`,
preserving the existing order (add at the end, space-separated).
**Verify**: `node -e "console.log(require('./package.json').scripts['test:integration'])"`
→ the printed string contains both new filenames.

### Step 3: Run the full integration suite
**Verify**: `pnpm run test:integration` → exit 0 and both new files appear in
the runner output. If a new file FAILS, STOP and report (do not edit the test
here; open a TDD plan so the behavior is pinned before wiring).

## Done criteria

- [ ] `pnpm run test:integration` runs both previously-omitted files and exits 0.
- [ ] `pnpm test` exits 0.
- [ ] Only `package.json` modified.
- [ ] `plans/README.md` row 004 set to DONE.

## STOP conditions

- Either newly-wired test FAILS — do not modify the test to force a pass; report
  and hand off to a TDD follow-up plan.
- A test file listed in `package.json:27` no longer exists on disk (drift).