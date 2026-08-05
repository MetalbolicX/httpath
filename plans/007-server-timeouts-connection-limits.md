# Plan 007: Configure HTTP server timeouts & connection limits (TDD)

> **Executor instructions**: Tests first, then the change. Run every
> verification command and confirm the expected result before moving on. On a
> STOP condition, stop and report. Update `plans/README.md` when done.
>
> **Drift check**: `git diff --stat 1b74c20..HEAD -- src/Node/Http.res src/Httpath.res`

## Status

- **Priority**: P1 | **Effort**: M | **Risk**: MED
- **Depends on**: Phase 1 (green gate baseline)
- **Category**: security / perf (DoS hardening)
- **Methodology**: `[TDD]` — changes the request lifecycle; behavior must be
  pinned by integration tests (slowloris-style) before the options land.
- **Planned at**: commit `1b74c20`, 2026-08-05

## Why this matters

`src/Node/Http.res:86-87` calls `createServer(callback)` with no options, so
`requestTimeout`/`headersTimeout` default disabled and `maxConnections` is
unset. A single client can hold thousands of sockets open indefinitely
(slowloris). Node ≥22 closes idle connections on `closeAllConnections`, but the
missing timeouts leave the server exposed to header/body trickle attacks.

## Current state

- `src/Node/Http.res:85-87` — `external _createServer` takes only the callback;
  no options object is passed at the call site.
- `src/Node/Http.res:94-95` — `_createHttpsServer` already takes `httpsOptions`;
  timeout options would need an analogous options-bearing external or a
  post-construction setter (`server.requestTimeout = ...`).
- `src/Httpath.res` constructs the server via `Http.startServer`; the options
  must be threaded from `Config` (or hardcoded sane defaults documented here).
- ReScript bindings: Node `Server` exposes writable int props
  `requestTimeout`, `headersTimeout`, `keepAliveTimeout`, `maxConnections`,
  `maxHeadersCount`. The cleanest ReScript path is `@set` externals or a single
  options record. Use `@send`/`@set` externals to match the existing binding
  style (`Http.res:88-90`).

## Commands you will need

| Purpose | Command | Expected |
|---------|---------|----------|
| Build | `pnpm run build` | exit 0 |
| Unit tests | `pnpm run test:unit` | exit 0 |
| Integration tests | `pnpm run test:integration` | exit 0, incl. new slowloris test |
| Full gate | `pnpm test` | exit 0 |

## Suggested executor toolkit

- Follow the project's ReScript binding conventions (see
  `src/Node/Http.res:84-118` for `@send`/`@set`/`@module` examples). Match the
  style; do not introduce a JS helper file unless a binding is genuinely
  impossible.
- Use `node --test` for the integration harness (existing pattern:
  `tests/integration/lan_*.test.mjs`).

## Scope

**In scope**:
- `src/Node/Http.res` (server options/setters + the two create call sites).
- `src/Httpath.res` (thread defaults if config is chosen).
- `tests/integration/server_timeouts.test.mjs` (new).

**Out of scope**:
- `src/Security/RateLimit.res` (plan 008).
- Graceful shutdown drain (plan 010).
- Any change to the public CLI flags for this plan (defaults only).

## Steps

### Step 1: Write the failing integration test (RED)
Create `tests/integration/server_timeouts.test.mjs` using the real-handler
spawning pattern from `tests/integration/lan_e2e.test.mjs`. Cover:
1. `headersTimeout` — open a socket, send the request line + one header byte,
   then trickle; assert the connection is closed within the configured
   `headersTimeout` (use a SHORT override, e.g. 800 ms, set via a test-only
   env var or a small explicit config flag exposed for tests — see STOP note).
2. `requestTimeout` — send headers fully but trickle the body; assert close
   within the configured timeout.
3. `maxConnections` — open `maxConnections+1` sockets and assert the last is
   refused or the server rejects new ones (document the tolerance window).
Use `node --test` subtests; mirror the cleanup `finally` kill pattern.
**Verify**: `node --test tests/integration/server_timeouts.test.mjs` → the new
tests FAIL (timeout options not yet set) or the assertions about "closed within
X ms" fail because connections hang. Record the observed failure.

### Step 2: Add ReScript bindings for the options
In `src/Node/Http.res`, add `@set` externals (or an options record external) for
`requestTimeout`, `headersTimeout`, `keepAliveTimeout`, `maxConnections`,
`maxHeadersCount`. Match the existing `@set external setOnAbort` style
(`Http.res:118`).
**Verify**: `pnpm run build` → exit 0, no type errors. (Do not wire values yet.)

### Step 3: Apply sensible defaults at server construction
At the `createServer`/`createHttpsServer` call sites, set:
- `requestTimeout = 30000` (30 s)
- `headersTimeout = 32000` (must be > requestTimeout per Node docs)
- `keepAliveTimeout = 5000`
- `maxConnections = 1024`
- `maxHeadersCount = 100` (Node default is 100; keep explicit only if it aids
  the test—otherwise omit).
Expose a single `ServerTimeoutConfig` so tests (Step 1) can override via an env
var read in `Httpath.res` (`HTTPATH_HEADERS_TIMEOUT`, etc.) OR a test entrypoint
that constructs the server with small timeouts. Whichever you choose, ensure the
test value is applied BEFORE `listen`.
**Verify**: `pnpm run build` → exit 0.

### Step 4: Re-run the RED test (GREEN)
**Verify**: `node --test tests/integration/server_timeouts.test.mjs` → exit 0.

### Step 5: Wire the new test into the gate
Add `tests/integration/server_timeouts.test.mjs` to `package.json:27`
`test:integration` (cf. plan 004's pattern).
**Verify**: `pnpm run test:integration` → exit 0.

### Step 6: Full regression
**Verify**: `pnpm test` → exit 0.

## Test plan

- New file `tests/integration/server_timeouts.test.mjs` with the 3 cases above.
- Model the child-process spawn + `httpGet` on `tests/integration/lan_e2e.test.mjs`.
- Existing behavior must not regress: `lan_e2e`'s 12-request sequence still
  completes within the new requestTimeout (it sends headers fast — fine).

## Done criteria

- [ ] `tests/integration/server_timeouts.test.mjs` exists and passes.
- [ ] `src/Node/Http.res` sets `requestTimeout`, `headersTimeout`,
      `keepAliveTimeout`, `maxConnections` at construction.
- [ ] `pnpm test` exits 0.
- [ ] No file outside the in-scope list is modified.
- [ ] `plans/README.md` row 007 set to DONE.

## STOP conditions

- A test needs an override knob that would require a NEW public CLI flag —
  STOP and align with the operator before adding a flag; an env var read in
  `Httpath.res` is acceptable as a test-only escape.
- `headersTimeout` must be greater than `keepAliveTimeout` per Node docs; if your
  chosen values violate that, Node logs a warning — fix the values, don't ignore.
- The slowloris test is flaky due to scheduling jitter on CI — make the bound
  generous (e.g. assert close < `timeout + 1000ms`) and deterministic; report if
  it cannot be made stable.