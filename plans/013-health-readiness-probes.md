# Plan 013: Add `/healthz` and `/readyz` probes with contracts (SDD)

> **Executor instructions**: SDD plan — Phase A spec/review before code. Run
> every verification command. On a STOP condition, stop and report. Update
> `plans/README.md` when done.
>
> **Drift check**: `git diff --stat 1b74c20..HEAD -- src/Server/Handler.res src/Node/Http.res src/Cfg`

## Status

- **Priority**: P2 | **Effort**: M | **Risk**: MED
- **Depends on**: 007 (probes share the timeout-configured server)
- **Category**: observability / ops
- **Methodology**: `[SDD]` — introduces two new HTTP contracts (response shape +
  status semantics) that orchestrators/load-balancers will depend on; spec-first.
- **Planned at**: commit `1b74c20`, 2026-08-05

## Why this matters

A load balancer or container orchestrator has no way to probe httpath's liveness
or drain readiness: there are no `/healthz`/`/readyz` endpoints. Without them,
rolling deploys and auto-restart rely on TCP-only checks that miss an app that's
listening but wedged.

## Current state

- `src/Server/Handler.res` routes based on path; no health routes today.
- `src/Node/Http.res` builds `Types.request` and dispatches to the handler.
- No config flag controls the probes; the audit found no health endpoints.

## Commands you will need

| Purpose | Command | Expected |
|---------|---------|----------|
| Build | `pnpm run build` | exit 0 |
| Integration | `pnpm run test:integration` | exit 0 |
| Full gate | `pnpm test` | exit 0 |

## Phase A — Spec & interface

### Step A1: Delta spec
`sdd/health-probes/spec/health-probes.md`. Define contracts:
- **`GET /healthz`** — liveness. Always available once the server is listening
  (even during shutdown, until the socket closes). Returns `200 OK` with
  `{"status":"ok"}` and `content-type: application/json`. Trivial; no
  downstream checks. Body ≤ ~30 bytes.
- **`GET /readyz`** — readiness. Returns `200 {"status":"ready"}` when the
  server is accepting new requests; returns `503
  {"status":"draining"}` once a shutdown signal has been received (the server is
  draining in-flight requests and should be removed from the LB pool).
- **No auth required** on probes — orchestrators can't usually present Basic
  Auth. Probes exempt the `--lan` auth gate. (Threat model: probes reveal only
  "up/draining", not content. Document the exemption in the spec.)
- **Headers**: reuse the standard security headers (do not bypass them).
- **Scenarios**: (1) `GET /healthz` during normal run → 200. (2) `GET /readyz`
  during normal run → 200 ready. (3) SIGTERM then `GET /readyz` before exit →
  503 draining. (4) probe under `--lan` without credentials → 200 (exempt).
  (5) probe under `--lan` with a wrong path → existing 404/401 behavior.
**Verify**: spec reviewed; record in `plans/README.md`.

### Step A2: Interface
Add a `Types.healthResponse` or reuse `Types.response` with prebuilt bodies. Add
a mutable `draining` flag threaded into the handler (set true on SIGTERM via the
abort path from plan 010).
**Verify**: `pnpm run build` → exit 0.

## Phase B — TDD implementation

### Step B1: Integration tests (RED)
`tests/integration/health_probes.test.mjs`:
1. `GET /healthz` → 200, JSON `{"status":"ok"}`.
2. `GET /readyz` → 200 ready.
3. Send SIGTERM, then within the drain window `GET /readyz` → 503 draining
   (requires plan 010's drain path to expose the draining state without exiting
   immediately).
4. `--lan` without credentials: `GET /healthz` → 200 (auth-exempt).
**Verify**: `node --test tests/integration/health_probes.test.mjs` → cases FAIL.

### Step B2: Implement routes in `Handler.res`
Match path before the file handler. Build the JSON response with the security
headers applied.
**Verify**: `pnpm run build` → exit 0.

### Step B3: Expose draining state
Wire the SIGTERM path (plan 010) to set a `draining` ref the handler reads for
`/readyz`. Ensure the flag is set BEFORE `closeAllConnections`.
**Verify**: `pnpm run build` → exit 0.

### Step B4: GREEN + gate
Wire `health_probes.test.mjs` into `package.json:27`. Run `pnpm test`.
**Verify**: exit 0.

## Scope

**In scope**: `src/Server/Handler.res`, `src/Httpath.res` (draining flag), the
new spec + test file, `package.json` (test list).
**Out of scope**: structured logging format (plan 014), the shutdown timer
itself (plan 010).

## Done criteria

- [ ] `/healthz` returns 200 JSON `{"status":"ok"}` unconditionally while up.
- [ ] `/readyz` returns 200 ready / 503 draining.
- [ ] Probes are auth-exempt under `--lan`.
- [ ] `pnpm test` exits 0.
- [ ] `plans/README.md` row 013 set to DONE.

## STOP conditions

- The draining state can't be observed because plan 010's hard exit fires too
  fast — sequence strictly after 010 lands its drain timeout.
- You're tempted to add downstream-dependency health checks (disk, external
  services) for a file server — out of scope; `healthz` is a process liveness
  only.

## Follow-ups

> Archived during SDD archive phase. Do not reopen; track via next change's apply
> or as a standalone investigation.

- **F1 (WARNING)** — Add integration tests for SCN-HP-002 (liveness-during-drain),
  SCN-HP-004 (ready-during-drain via SIGTERM), SCN-HP-005/006 (--lan auth exemption),
  SCN-HP-007 (POST→405). Today's coverage is unit + source-verified only. Blocked on: a
  more reliable `node:test` child-harness pattern, or the integration test runner gaining
  the ability to observe SIGTERM state without race.
- **F2 (INFO)** — Design API drift: design #3100 said `Handler.make(~draining, config)
  => handler` but implementation chose `Handler.make(config) => {handler, drain}` —
  Handler owns the drain ref. Behaviorally equivalent; ownership model differs. Future
  readers should consult the implementation over the design for the canonical API.