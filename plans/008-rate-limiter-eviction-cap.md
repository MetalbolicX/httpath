# Plan 008: Add rate-limiter eviction and map-size cap (TDD)

> **Executor instructions**: Tests first, then the change. Verify each step.
> On a STOP condition, stop and report. Update `plans/README.md` when done.
>
> **Drift check**: `git diff --stat 1b74c20..HEAD -- src/Security/RateLimit.res tests/unit`

## Status

- **Priority**: P1 | **Effort**: M | **Risk**: MED
- **Depends on**: Phase 1 baseline
- **Category**: security / perf (memory DoS)
- **Methodology**: `[TDD]` — the limiter state machine changes; unit tests for
  eviction and cap must exist before the refactor.
- **Planned at**: commit `1b74c20`, 2026-08-05

## Why this matters

`src/Security/RateLimit.res:2` states "No eviction: restart resets all state."
The per-IP `Belt.Map.String` grows unbounded; a LAN attacker (or a script
looping through many source IPs) fills process memory. Eviction + a hard cap
make the limiter safe under connection pressure.

## Current state

- `src/Security/RateLimit.res:19-24` — `type t = { mutable state: Map.t<ipState>,
  maxReq, windowMs, now }`.
- `RateLimit.res:41-79` — `tick` only ever `Map.set`; never removes entries.
- No `maxIps`, no sweep, no cap.
- `src/Httpath.res:17-27` constructs the limiter under LAN; non-LAN has it off.

## Commands you will need

| Purpose | Command | Expected |
|---------|---------|----------|
| Build | `pnpm run build` | exit 0 |
| Unit tests | `pnpm run test:unit` | exit 0, incl. new eviction tests |
| Full gate | `pnpm test` | exit 0 |

## Scope

**In scope**:
- `src/Security/RateLimit.res` (add `maxIps`, a `sweepExpired`, and an
  over-cap eviction policy).
- `src/Security/RateLimit.resi` (expose new constructor args + `sweep` if
  periodic).
- `src/Httpath.res` (pass `maxIps` default; optionally call `sweep` on a timer
  when `config.lan`).
- `tests/unit/rate_limit_test.res` (new or extend existing `rate_limit_test`).

**Out of scope**:
- `src/Security/Tls.res`, `src/Node/Http.res`, server timeouts (plan 007).

## Steps

### Step 1: Write failing unit tests (RED)
In `tests/unit/rate_limit_test.res` model after the existing auth unit tests
(`tests/unit/auth_basic_test.res`). Cover:
1. `sweepExpired` removes an IP whose `windowStart` is older than `windowMs`.
2. `sweepExpired` keeps within-window IPs.
3. When `Map.size >= maxIps`, a brand-new IP evicts the oldest-by-windowStart
   IP before inserting the new one (LRU-ish by windowStart; document the
   policy in a comment).
4. Eviction does NOT reject the new IP on its first request (count starts at 1).
5. After eviction, the evicted IP's next request is treated as a fresh IP.
6. `maxIps = 0` means "no cap" (backward-compatible default).
Use `Js.test`/retest assertions; inject a fake `now` (already a constructor
arg) to control time.
**Verify**: `pnpm run test:unit -- tests/unit/rate_limit_test.res.mjs` → the new
tests FAIL (no eviction logic exists).

### Step 2: Extend the record + constructor
Add `maxIps: int` to `type t` and `~maxIps: int` to `make` (default 0).
**Verify**: `pnpm run build` → exit 0.

### Step 3: Implement `sweepExpired` and over-cap eviction
- `sweepExpired(limiter)`: iterate the map, drop entries where
  `now - windowStart > windowMs`. Return the number removed.
- In `tick`, after computing the decision, if `Map.size(limiter.state) >
  limiter.maxIps` and `maxIps > 0`, evict the entry with the smallest
  `windowStart` (oldest). Insert the new IP only after eviction.
**Verify**: `pnpm run build` → exit 0.

### Step 4: Wire `maxIps` from `Httpath.res`
Pass `~maxIps=10000` (or read from config if a flag exists later). Optionally
start a `setInterval` calling `sweepExpired` every `windowMs` when `config.lan`
— scope this carefully; plan 010 owns shutdown timers, so register the timer
handle so it can be cleared on shutdown (cross-check plan 010).
**Verify**: `pnpm run build` → exit 0.

### Step 5: GREEN + full gate
**Verify**: `pnpm run test:unit -- tests/unit/rate_limit_test.res.mjs` → exit 0;
`pnpm test` → exit 0.

## Test plan

- New unit tests in `tests/unit/rate_limit_test.res` (cases 1–6 above).
- Fake clock via the existing `now` constructor arg — do not introduce real
  timers into unit tests.
- Existing `lan_e2e` integration rate-limit assertions (10/10 allow then 429)
  must still pass — the eviction policy must not drop an active in-window IP.

## Done criteria

- [ ] `tests/unit/rate_limit_test.res` passes with all 6 cases.
- [ ] `RateLimit.res` has `maxIps` + `sweepExpired` + over-cap eviction.
- [ ] `pnpm test` exits 0; existing rate-limit integration assertions intact.
- [ ] `plans/README.md` row 008 set to DONE.

## STOP conditions

- The eviction policy would need to reject the new IP's first request (memory
  pressure leaking into correctness) — STOP and align; the new IP must always
  start at count=1.
- A periodic `setInterval` sweep must be clearable on shutdown — if wiring it
  requires touching the shutdown path, STOP and sequence after plan 010 instead
  of racing 010's ownership of timers.