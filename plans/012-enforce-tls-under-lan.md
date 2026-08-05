# Plan 012: Enforce TLS by default under `--lan` (SDD)

> **Executor instructions**: SDD plan — Phase A spec/review before code. Run
> every verification command. On a STOP condition, stop and report. Update
> `plans/README.md` when done.
>
> **Drift check**: `git diff --stat 1b74c20..HEAD -- src/Cfg src/Httpath.res src/Security/Tls.res README.md`

## Status

- **Priority**: P1 | **Effort**: L | **Risk**: HIGH
- **Depends on**: 011 (shares the `Httpath.res` preflight path; lands as one
  coherent secure-startup change set)
- **Category**: security (policy decision)
- **Methodology**: `[SDD]` — changes the secure-defaults contract for LAN; needs
  spec + interface sign-off because it flips a default and adds an escape flag.
- **Planned at**: commit `1b74c20`, 2026-08-05

## Why this matters

The audit flagged that Basic Auth credentials under `--lan` without `--tls` are
sniffable (HTTP Basic over plaintext). Today TLS is opt-in via `--tls`; a user
who adds `--lan --auth` believes they're protected while the password crosses
the wire in cleartext. The secure-by-default contract should be: `--lan` implies
TLS unless the operator explicitly opts out.

## Current state

- `src/Cfg/Config.res` — `lan`, `tls`, `noAuth` flags; `tls` defaults `false`.
- `src/Cfg/Parser.res` — `--tls` opts in; no `--no-tls` escape hatch.
- `src/Httpath.res:108-114` — banner uses `https://` when a TLS key is set.
- `src/Httpath.res:63-86` — TLS-aware startup; auto-generates a self-signed cert
  via `src/Security/Tls.res` when `--tls` is set without explicit cert/key.
- `src/Security/Tls.res:112-163` — cert reuse implemented (plan 003 doc fix).

## Commands you will need

| Purpose | Command | Expected |
|---------|---------|----------|
| Build | `pnpm run build` | exit 0 |
| Integration | `pnpm run test:integration` | exit 0 |
| Full gate | `pnpm test` | exit 0 |

## Phase A — Spec & interface

### Step A1: Delta spec
`sdd/enforce-tls-under-lan/spec/lan-tls-default.md`. Define:
- **Resolved defaults**: when `config.lan === true`, TLS is REQUIRED unless
  `config.noTls === true`. Loopback (`--lan` off) is unchanged — no TLS by
  default.
- **New flag**: `--no-tls` (escape hatch), default `false`. Mutually advisory:
  passing `--tls` is now redundant under `--lan` but still honored for
  explicit-cert use. `--no-tls` + `--tls-cert` is a config error (refuse at
  parse time with `ParseError`).
- **Scenarios**: (1) `--lan` alone → auto-generates self-signed, listens HTTPS,
  banner shows `https://`. (2) `--lan --no-tls` → HTTP, loud warning logged.
  (3) `--lan --tls-cert X --tls-key Y` → HTTPS with explicit cert. (4)
  `--lan --no-tls --tls-cert X` → parse-time refusal. (5) loopback unaffected.
**Verify**: spec reviewed/signed off; record in `plans/README.md`.

### Step A2: Interface
- `src/Cfg/Config.res` add `noTls: bool` (default false).
- `src/Cfg/Parser.res` add `--no-tls`; set `tls = lan` (i.e. TLS implied when
  LAN is on) at the LAN-defaults block (`Parser.res:242-253`).
- `src/Cfg/ParseError.res` add `ConflictingTlsFlags`.
**Verify**: `pnpm run build` → exit 0.

## Phase B — TDD implementation

### Step B1: Unit tests (RED)
`tests/unit/parser_test.res` extend with the 5 scenarios above as parse-level
assertions (config fields after parse).
**Verify**: `pnpm run test:unit -- tests/unit/parser_test.res.mjs` → new cases
FAIL.

### Step B2: Wire defaults + parse-time conflict check
In `Parser.res` LAN-default block: `tls = lan && !noTls`. In the validate
phase: reject `noTls && (tlsCert != None || tlsKey != None)`.
**Verify**: `pnpm run build` → exit 0; RED tests now GREEN.

### Step B3: Integration tests (RED→GREEN)
Extend `tests/integration/lan_tls.test.mjs`:
1. `--lan` (no `--tls`) → server speaks HTTPS (socket upgrade to TLS). Use
   `https.request` with `rejectUnauthorized: false` for the self-signed test.
2. `--lan --no-tls` → server speaks HTTP AND stderr contains a WARNING citing
   the credential-sniffing risk.
3. `--lan --no-tls --tls-cert <p>` → child exits non-zero with the conflict
   error.
**Verify**: `pnpm run test:integration` → exit 0.

### Step B4: Docs
Update `README.md` LAN Security section: TLS is on by default under `--lan`;
`--no-tls` is the documented escape; show the warning that will appear.
**Verify**: `grep -n "no-tls\|--lan.*TLS" README.md` → docs match.

## Scope

**In scope**: `src/Cfg/{Config,Parser,ParseError}.res(.resi)`, `src/Httpath.res`
(banner already conditional), `tests/unit/parser_test.res`,
`tests/integration/lan_tls.test.mjs`, `README.md`.
**Out of scope**: the cert-reuse implementation (shipped), protected-dir guard
(plan 011), health probes (plan 013).

## Done criteria

- [ ] `--lan` alone listens over HTTPS with an auto-generated cert.
- [ ] `--lan --no-tls` logs a credential-sniffing warning and serves HTTP.
- [ ] `--lan --no-tls --tls-cert X` refuses at startup.
- [ ] Loopback (`--lan` off) is unchanged.
- [ ] `pnpm test` exits 0.
- [ ] `plans/README.md` row 012 set to DONE.

## STOP conditions

- Auto-generation requires openssl and it's absent — the existing
  `MissingOpenssl` path handles this; ensure the refused message advises
  `--no-tls` OR installing openssl. Don't fall back to silent HTTP under `--lan`.
- A downstream tooling consumer depends on `--lan` Plaintext without `--no-tls`
  (e.g. an internal reverse proxy terminating TLS) — STOP and align on whether
  to allow `--no-tls` implicitly when `--trust-proxy` is set; default is to still
  require the explicit `--no-tls`.