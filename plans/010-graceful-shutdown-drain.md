# Plan 010: Replace 500 ms hard-exit with drained graceful shutdown (TDD)

> **Executor instructions**: Tests first. Verify each step. On a STOP
> condition, stop and report. Update `plans/README.md` when done.
>
> **Drift check**: `git diff --stat 1b74c20..HEAD -- src/Httpath.res src/Node/Http.res tests/integration/graceful_shutdown.test.js`

## Status

- **Priority**: P1 | **Effort**: M | **Risk**: MED
- **Depends on**: 007 (so drains respect the new per-connection timeouts)
- **Category**: reliability
- **Methodology**: `[TDD]` — lifecycle behavior change; pin with the existing
  `graceful_shutdown.test.js` (now wired by plan 004) plus a new in-flight
  drain test.
- **Planned at**: commit `1b74c20`, 2026-08-05

## Why this matters

`src/Httpath.res:152` does `setTimeout(() => Process.exit(0), 500)` after
`AbortController.abort`. Any request taking >500 ms (a large file, a slow
client) is truncated mid-response. The 500 ms hammer should be a configurable
*last-resort* fallback, not the primary path.

## Current state

- `src/Httpath.res:149` — `AbortController.abort(controller)` triggers the abort
  handler in `Http.startServer` (`Http.res:616-631`).
- `src/Httpath.res:152` — hard `Process.exit(0)` after 500 ms.
- `src/Httpath.res:155-159` — SIGINT/SIGTERM handlers.
- `src/Httpath.res:164-168` — `closed` promise awaited before exit.
- `src/Node/Http.res:90` — `closeAllConnections(s)` is available (Node ≥22).
- `tests/integration/graceful_shutdown.test.js` exists (wired by plan 004).

## Commands you will need

| Purpose | Command | Expected |
|---------|---------|----------|
| Build | `pnpm run build` | exit 0 |
| Integration | `pnpm run test:integration` | exit 0, incl. graceful_shutdown |
| Full gate | `pnpm test` | exit 0 |

## Scope

**In scope**:
- `src/Httpath.res` (shutdown sequence; configurable fallback timeout).
- `src/Node/Http.res` (only if the abort handler needs to call
  `closeAllConnections` before `close`).
- `tests/integration/graceful_shutdown.test.js` (extend).

**Out of scope**:
- Server timeouts themselves (plan 007).
- Rate-limiter timer sweep (plan 008).

## Steps

### Step 1: Write/extend the failing tests (RED)
In `tests/integration/graceful_shutdown.test.js`:
1. Existing: SIGTERM closes the server and exits 0 — keep passing.
2. NEW: start a request that downloads a multi-MB fixture, send SIGTERM
   mid-transfer, assert the in-flight response completes (status 200 and full
   body received) before the process exits — OR, if the drain timeout is
   exceeded, assert the connection is closed cleanly (no `ECONNRESET` on the
   client side beyond the documented fallback). Use a `drainTimeout` override
   (env var `HTTPATH_DRAIN_TIMEOUT_MS`) set to a known value for the test.
3. NEW: SIGTERM with NO in-flight requests exits within ~50 ms (fast path).
**Verify**: `node --test tests/integration/graceful_shutdown.test.js` → the new
in-flight test FAILS (current 500 ms hammer truncates the response).

### Step 2: Make the fallback configurable
Add a `drainTimeoutMs` constant in `src/Httpath.res` sourced from
`process.env.HTTPATH_DRAIN_TIMEOUT_MS` (default 30000). Keep the hard exit as
the LAST resort, but only after `closeAllConnections` + `close`.

### Step 3: Reorder the shutdown sequence
On SIGINT/SIGTERM:
1. `AbortController.abort(controller)` (stops accepting new requests via the
   abort handler → `server.close()`).
2. Call `Http.closeAllConnectionsOnAbort(s)` style call so it calls
   `closeAllConnections` first — but note: `closeAllConnections` destroys idle
   connections; in-flight keepalive sockets with active responses are allowed
   to finish. Confirm Node ≥22 semantics in a comment.
3. `await closed` (the server close promise).
4. Only THEN schedule the hard `Process.exit(0)` as a fallback after
   `drainTimeoutMs` — and clear it once `closed` resolves.
**Verify**: `pnpm run build` → exit 0.

### Step 4: GREEN + full gate
**Verify**: `node --test tests/integration/graceful_shutdown.test.js` → exit 0;
`pnpm test` → exit 0.

## Test plan

- Extend `graceful_shutdown.test.js` with the in-flight drain test and the
  no-in-flight fast-exit test.
- Use a real multi-MB fixture served from a temp dir to force a > 500 ms
  transfer (or artificially slow the client read with a paused socket fixture).
- The drain timeout must be overridable for tests; the env var is the test-only
  escape (not a new CLI flag).

## Done criteria

- [ ] In-flight SIGTERM completes the response (or closes cleanly after the
      documented fallback) — no truncated bodies in the fast path.
- [ ] `Process.exit(0)` is only reached after `closed` OR `drainTimeoutMs`.
- [ ] `graceful_shutdown.test.js` passes with the new cases.
- [ ] `pnpm test` exits 0.
- [ ] `plans/README.md` row 010 set to DONE.

## STOP conditions

- `closeAllConnections` semantics on Node ≥22 don't match the assumption that
  in-flight responses finish — verify against current Node docs; if it forces
  immediate socket destroy, switch to NOT calling it during drain and rely on
  `server.close()` + the per-connection timeouts from plan 007.
- The test's artificial slow client is flaky — make the fixture deterministic
  (fixed size + known client read rate) or STOP for alignment.