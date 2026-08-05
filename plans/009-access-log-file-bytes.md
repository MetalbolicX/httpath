# Plan 009: Emit real `bytes` in the access log for streamed files (TDD)

> **Executor instructions**: Tests first. Verify each step. On a STOP
> condition, stop and report. Update `plans/README.md` when done.
>
> **Drift check**: `git diff --stat 1b74c20..HEAD -- src/Node/Http.res src/Server/AccessLog.res tests/integration/lan_e2e.test.mjs`

## Status

- **Priority**: P2 | **Effort**: M | **Risk**: MED
- **Depends on**: Phase 1 baseline
- **Category**: bugfix (observability)
- **Methodology**: `[TDD]` — the audit confirmed `bytes: 0` is hardcoded for
  `File(_)` with a "TODO: track actual bytes" comment; behavior change must be
  pinned by an integration assertion on the log line.
- **Planned at**: commit `1b74c20`, 2026-08-05

## Why this matters

The access-log spec (`access-log`) requires the bytes field to be populated for
non-zero responses. Today file responses always log `| 0`, so an operator
reading the log sees a phantom "all empty" server. Fixing it makes the log
trustworthy and satisfies the spec scenario.

## Current state

- `src/Node/Http.res` normal path (lines ~487-508): `bytes` is computed as
  `Html(s) => String.length(s) | Empty => 0 | File(_) => 0`. The `File(_) => 0`
  branch is the TODO.
- `src/Server/AccessLog.res` formats `{timestamp, ip, method, path, status,
  bytes}` into a pipe-delimited line; the `bytes` value comes from the caller.
- `tests/integration/lan_e2e.test.mjs:284-336` already reads the access log,
  counts 12 lines, and checks the 6-field regex — but does NOT assert a
  non-zero bytes value for the file GETs. (Existing test should remain green.)

## Commands you will need

| Purpose | Command | Expected |
|---------|---------|----------|
| Build | `pnpm run build` | exit 0 |
| Integration | `pnpm run test:integration` | exit 0 |
| Full gate | `pnpm test` | exit 0 |

## Scope

**In scope**:
- `src/Node/Http.res` (compute real bytes for the File path; pipe a stream
  byte-counter or use `Content-Length`).
- `tests/integration/lan_e2e.test.mjs` (add a bytes assertion) OR a new
  `tests/integration/access_log_bytes.test.mjs`.

**Out of scope**:
- `src/Server/AccessLog.res` format (unchanged).
- Multipart/range responses (range is a roadmap item, not shipped).

## Steps

### Step 1: Write the failing test (RED)
In `tests/integration/lan_e2e.test.mjs` (or a focused new
`access_log_bytes.test.mjs`), after the existing log-line assertions, add:
- Assert at least one line whose method is `GET` and path is a real file has a
  bytes value `> 0` and equal to the known file size served by the test
  fixture (the e2e serves a known small file — read its size with `fs.statSync`
  and compare).
- Keep the existing 12-line count assertion green.
**Verify**: `node --test tests/integration/lan_e2e.test.mjs` → the new bytes
assertion FAILS (current logs `0`).

### Step 2: Pick the byte-counting strategy
Two viable approaches — choose based on `writeResponse` in `Http.res:185-220`:
1. **Content-Length header** — if the file `stat` size is known and the
   response already sets `Content-Length`, read it from the response headers
   (cheap, synchronous, exact for non-range). Prefer this if the handler sets
   `Content-Length` for `File`.
2. **Stream byte counting** — attach a listener to the readStream `'end'`/`pipe`'s `bytes` and log asynchronously after the stream finishes. More
   accurate but adds an async hop before the log line is emitted.
Document the chosen approach as a comment at `Http.res` near the `bytes` calc.
**Verify**: `grep -n "bytes" src/Node/Http.res` → shows the changed branch.

### Step 3: Implement
Replace `File(_) => 0` with the chosen approach. If using Content-Length, ensure
the handler actually sets `Content-Length` for file responses; if it doesn't,
derive from `Fs.statSync(path).size` at the point you build the response.
**Verify**: `pnpm run build` → exit 0.

### Step 4: GREEN + full gate
**Verify**: `pnpm run test:integration` → exit 0 incl. the new bytes assertion;
`pnpm test` → exit 0.

## Test plan

- New assertion in `lan_e2e.test.mjs` (or a dedicated
  `access_log_bytes.test.mjs`) tying the logged bytes to the served file's
  real size.
- Existing 12-line count + 6-field regex assertions stay green.
- `Empty` (e.g. 401/429 reject) bodies still log `0` — keep that path.

## Done criteria

- [ ] A file GET produces an access-log line with `bytes` == real file size.
- [ ] `pnpm test` exits 0.
- [ ] No `Todo`/`bytes: 0` placeholder remains for the File branch.
- [ ] `plans/README.md` row 009 set to DONE.

## STOP conditions

- Accurate bytes would require deferring the log line to after the stream
  finishes, which reorders log lines relative to other requests — STOP and
  align on whether per-request ordered logs matter; the Content-Length approach
  avoids reordering if it's exact.
- The handler does not set `Content-Length` and deriving it from `stat` would
  miscount for future range responses — implement Content-Length from `stat`
  now and note that range support (roadmap) must revisit this.