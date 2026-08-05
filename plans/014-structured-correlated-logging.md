# Plan 014: Structured, correlated access + application logging (SDD)

> **Executor instructions**: SDD plan — Phase A spec/review before code. Run
> every verification command. On a STOP condition, stop and report. Update
> `plans/README.md` when done.
>
> **Drift check**: `git diff --stat 1b74c20..HEAD -- src/Server/AccessLog.res src/Utils/Logger.res src/Node/Http.res`

## Status

- **Priority**: P2 | **Effort**: L | **Risk**: HIGH
- **Depends on**: 013 (shared request-id source for probe logs)
- **Category**: observability
- **Methodology**: `[SDD]` — changes the log *format* that pipelines will parse;
  introduces a correlation id crossing the HTTP→WS→access-log boundary; spec-first.
- **Planned at**: commit `1b74c20`, 2026-08-05

## Why this matters

`src/Utils/Logger.res` emits plain-text console output; the access log is a
pipe-delimited single-line with no request id. In production you cannot
correlate an access-log line to an application error across the WS/HTTP divide.
Structured JSON + a request id makes the logs queryable and traceable.

## Current state

- `src/Server/AccessLog.res:30-48` — pipe-delimited
  `ts | ip | method | path | status | bytes` (CR/LF replaced with `?`).
- `src/Utils/Logger.res` — plain-text `console.log`/`console.error` wrappers.
- `src/Node/Http.res` — builds `Types.request` (no request id today).
- No env knob to switch format.

## Commands you will need

| Purpose | Command | Expected |
|---------|---------|----------|
| Build | `pnpm run build` | exit 0 |
| Integration | `pnpm run test:integration` | exit 0 |
| Full gate | `pnpm test` | exit 0 |

## Phase A — Spec & interface

### Step A1: Delta spec
`sdd/structured-logging/spec/structured-logging.md`. Define:
- **Two sinks**: access log (existing dest: stdout or `--access-log` file) and
  application log (stderr).
- **Format**: one JSON object per line. Fields: `ts` (ISO8601 UTC ms),
  `level` (`info`/`warn`/`error`), `msg`, `request_id` (UUIDv4, absent when not
  a request-bound line), `ip`, `method`, `path`, `status`, `bytes` (access lines).
- **Backward-compat escape**: `--log=plain` (or `HTTPATH_LOG=plain`) restores the
  current pipe-delimited access log + plain app log. Default = `json`.
- **Request id generation**: generated per HTTP request in
  `src/Node/Http.res.buildRequest`, carried in a `x-request-id` response header
  and threaded into the access log + any application log emitted during the
  request. WS upgrades reuse the upgrade request's id until the socket closes.
- **Scenarios**: (1) access line is JSON with the full field set. (2) `--log
  plain` restores the legacy pipe line. (3) a `warn` during a request includes
  the same `request_id`. (4) the `x-request-id` response header is present.
**Verify**: spec reviewed; record in `plans/README.md`.

### Step A2: Interface
- `Types.request` gains `requestId: string`.
- `src/Utils/Logger.res` exposes `info`/`warn`/`error` taking an optional
  `~requestId` and emitting JSON or plain based on a module-level config set
  from `process.env.HTTPATH_LOG` at startup.
**Verify**: `pnpm run build` → exit 0.

## Phase B — TDD implementation

### Step B1: Unit tests (RED)
`tests/unit/logger_test.res`: (1) JSON shape per level; (2) `request_id` injected;
(3) plain-mode fallback emits the legacy pipe string. Capture stdout via a
spy/mock the project already uses (or a small internal sink you can inject).
**Verify**: `pnpm run test:unit -- tests/unit/logger_test.res.mjs` → FAIL.

### Step B2: Implement JSON formatter + request id
Generate UUIDv4 via `node:crypto.randomUUID()` in `buildRequest`. Thread it into
the access log call site in `Http.res` and into the application `Logger` calls.
**Verify**: `pnpm run build` → exit 0; RED tests GREEN.

### Step B3: Integration tests (RED→GREEN)
`tests/integration/logging_json.test.mjs`:
1. Make a request, parse the access-log line as JSON, assert the field set +
   that the response carried `x-request-id` matching the log's `request_id`.
2. `--log plain` → access line is the legacy pipe format.
**Verify**: `node --test tests/integration/logging_json.test.mjs` → GREEN.

### Step B4: Wire + gate
Add `logging_json.test.mjs` to `package.json:27`. Update README LAN Security
section to document `--log json|plain` and the `x-request-id` header.
**Verify**: `pnpm test` → exit 0.

## Scope

**In scope**: `src/Server/AccessLog.res`, `src/Utils/Logger.res(.resi)`,
`src/Node/Http.res` (request id), `src/Cfg/Config.res`/`Parser.res` (`--log`
mode), `tests/unit/logger_test.res`, `tests/integration/logging_json.test.mjs`,
`README.md`.
**Out of scope**: external log shipping, OTLP, non-Node runtimes.

## Done criteria

- [ ] Access + app logs are JSON by default with `request_id`.
- [ ] `--log plain` restores the legacy format.
- [ ] `x-request-id` response header present.
- [ ] `pnpm test` exits 0.
- [ ] `plans/README.md` row 014 set to DONE.

## STOP conditions

- Emitting JSON breaks a consumer that greps the legacy pipe format — keep the
  `--log plain` escape first-class; never remove it in this plan.
- `crypto.randomUUID` needs Node ≥19 (engines is `>=22` here) — fine; don't
  polyfill.
- A spy for capturing stdout in unit tests isn't present — extract a tiny
  injectable sink rather than monkeypatching `console`; STOP and align if that
  refactor exceeds one file.