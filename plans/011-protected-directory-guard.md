# Plan 011: Protected-directory startup guard for admin-privilege dirs — THE EDGE CASE (SDD)

> **Executor instructions**: This is an SDD plan. Phase A (spec/interface)
> MUST land and be reviewed before Phase B (TDD code). Run every verification
> command. On a STOP condition, stop and report. Update `plans/README.md` when
> done.
>
> **Drift check**: `git diff --stat 1b74c20..HEAD -- src/Cfg/Config.res src/Cfg/Parser.res src/Utils/Path.res src/Server/Handler.res src/Httpath.res README.md`

## Status

- **Priority**: P1 | **Effort**: L | **Risk**: HIGH
- **Depends on**: Phase 1 baseline (so the guard lands against a green gate)
- **Category**: security (the edge case the operator asked to detail)
- **Methodology**: `[SDD]` — cross-cutting (Config + Parser + Path +
  Httpath preflight + Handler); introduces a new contract (protected-path
  predicate) and a startup-time authorization decision; spec-first.
- **Planned at**: commit `1b74c20`, 2026-08-05

## Why this matters

`--allow-protected-dir` is parsed (`src/Cfg/Parser.res:112-113`), defaulted to
`false` (`src/Cfg/Config.res:50`), and *documented* in `README.md:126-128` as a
"Startup Guard — Refuses to serve system directories (`/etc`, `/boot`,
`C:\Windows`, etc.) unless `--allow-protected-dir` is passed." But there is
**zero enforcement**: `httpath --lan -d /etc` serves `/etc` to the network.
Path-traversal prevention (`Path.res:11-27`) only blocks `../../etc/passwd`
relative escapes; it does NOT stop a user who *intentionally* points the
served root at an admin-privilege directory. This is the audit's top blocker.

The guard must balance two failure modes:
- **Too strict** → power users/CI who legitimately serve `/usr/share/nginx/html`
  are blocked (hence the `--allow-protected-dir` escape hatch).
- **Too lax** → a typo like `httpath -d /` or `httpath -d /etc` silently exfiltrates
  the whole filesystem once `--lan` is on.

## Current state

- `src/Cfg/Config.res:14` — `allowProtectedDir: bool` field.
- `src/Cfg/Config.res:50` — default `false`.
- `src/Cfg/Parser.res:112-113` — `--allow-protected-dir` sets `true`.
- `src/Cfg/Parser.res:271` — wired into the config record.
- `src/Httpath.res:200` — usage string mentions the flag.
- `src/Utils/Path.res` — has `resolveSafePath`, `matchesPattern`,
  `hasSymlinkPrefix`. **No** protected-path predicate, **no** system-directory
  list.
- `src/Server/Handler.res` — no reference to `allowProtectedDir`.
- `src/Httpath.res` — no startup guard on `config.directory`.
- `README.md:126-128` — claims the guard exists.

## Edge case — admin-privilege directory protection (detailed model)

### What counts as "protected"

A directory is **protected** when serving its contents would expose
admin-privilege / system files regardless of path-traversal handling. The guard
classifies `config.directory` (after resolving to an absolute real path) as
protected when ANY of these hold:

1. **Well-known system roots** (deny-list of canonical absolute paths, matched
   case-insensitively on Windows):
   - POSIX: `/`, `/etc`, `/boot`, `/efi`, `/proc`, `/sys`, `/dev`, `/root`,
     `/var/log`, `/usr/sbin`, `/sbin`, `/bin`, `/lib`, `/lib64`, `/run`,
     `/srv` is ALLOWED (common doc root) unless it equals `/`.
   - macOS: `/System`, `/Library`, `/private/etc`, `/usr` (except
     `/usr/local/share` and `/usr/share` — common doc roots — ALLOWED).
   - Windows: `%SystemRoot%` (e.g. `C:\Windows`), `%ProgramFiles%`,
     `%ProgramFiles(x86)%`, `%SystemDrive%\` (the drive root, e.g. `C:\`),
     `C:\ProgramData`, `C:\Recovery`, `C:\$Recycle.Bin`.
2. **Privilege check (runtime, best-effort)** — the directory or any ancestor
   is NOT owned by the current user AND is NOT group/world-readable. This catches
   `~/.ssh`, `/root`, a colleague's home dir served by accident. On platforms
   where `fs.stat` ownership isn't authoritative (Windows ACLs), fall back to the
   well-known list only and log a warning that the privilege check is skipped.
3. **Ancestor traversal** — resolve the *real* path with `fs.realpath` (not
   `path.resolve`) so a symlinked doc root like `~/link-to-etc` is caught: if
   the realpath matches a protected entry, it's protected regardless of the
   requested path.

### The three behaviors at the boundary

- `config.allowProtectedDir === false` AND directory is protected → **startup
  refuses**: print the matched rule, the resolved real path, the
  `--allow-protected-dir` escape hatch, and `process.exit(1)` BEFORE `listen`.
  Default `127.0.0.1` and `--lan` behave identically — the guard is NOT LAN-only
  (a user running `httpath -d /etc` locally is also misconfigured).
- `config.allowProtectedDir === true` AND directory is protected → **startup
  proceeds with an explicit loud warning** to the access log + stderr naming
  the resolved path and the matched rule, so the consent is auditable.
- directory is NOT protected → silent proceed (no warning noise).

### Edge sub-cases the implementation must handle

1. **`config.directory` is a relative path** → resolve against `process.cwd()`
   first, THEN `realpath`. A user running `httpath -d ./etc` from `/` resolves to
   `/etc` → protected.
2. **`config.directory` doesn't exist** → existing preflight should already fail
   with a clear `ENOENT`; the guard runs AFTER the existence check so it can
   `realpath` safely.
3. **`config.directory` is a symlink to a protected dir** → realpath resolves it;
   the matched rule is reported as "resolved target of symlink".
4. **CI/sandbox containers** where `/srv` or `/usr/share/nginx/html` is the legit
   doc root → these are NOT in the deny-list; allowed silently.
5. **`--allow-protected-dir` plus `--lan` without `--tls`** → this plan does NOT
   force TLS (plan 012 owns that), but the warning line should advise TLS.
6. **Windows drive root `D:\` for a USB doc root** → drive roots are protected by
   default; a user wanting to serve a whole USB drive must pass
   `--allow-protected-dir`. Document this.
7. **Read-only filesystems (`/proc`, `/sys`)** → in the deny-list; never useful as
   a file server root.
8. **Home directory** (`~`, `os.homedir()`) → NOT protected (common doc root),
   but a descendant like `~/.ssh` IS protected by the privilege check.

### Escape hatch UX

When the guard refuses, the message MUST be copy-paste actionable:

```
httpath: refusing to serve a protected system directory.

  Requested:  /etc
  Resolved:   /etc
  Matched:    POSIX well-known system root ("/etc")

  Serving this directory exposes admin-privilege files over the network.
  If this is intentional and you accept the risk, re-run with:

      --allow-protected-dir

  (Consider also --tls when exposing over --lan.)
```

## Phase A — Spec & interface (REVIEW GATE — no code yet)

### Step A1: Write the SDD delta spec
Create `sdd/protected-dir-guard/spec/lan-protected-dir.md` delta spec (follow the
existing `sdd/add-lan-security/` delta-spec shape from memory obs #2999/#3000).
Include:
- **Purpose** (1 paragraph, drawn from "Why this matters" above).
- **Resolved defaults**: `allowProtectedDir = false`; guard runs at startup for
  both loopback and LAN; refuses on match unless the flag is set.
- **Scenarios** (Given/When/Then), one each for:
  1. POSIX well-known root refused at startup.
  2. Windows `C:\Windows` refused at startup.
  3. Symlinked doc root realpath-resolves to `/etc` → refused.
  4. `/usr/share/nginx/html` allowed silently (not in deny-list).
  5. `--allow-protected-dir` on `/etc` proceeds with a loud warning logged.
  6. Privilege check: home dir served but `~/.ssh` descendant is protected →
     the ancestor privilege check flags the served root when the immediate
     served dir is `~/.ssh` (NOT when serving `~` — `~` is allowed).
  7. `--lan -d /etc` refuses with the TLS advice line.
- **Out of scope**: per-request path-level protections (already covered by
  traversal + symlink guards); plan 012 (TLS enforcement under LAN).
**Verify**: the spec file exists and a human/agent reviewer signs off (record the
review approval in `plans/README.md` dependency notes for 011).

### Step A2: Define the interface
Update `src/Utils/Path.resi` and add a new module `src/Security/ProtectedDir.res`
(+ `.resi`) with the contract:
```
type matchedRule =
  | PosixWellKnown(string)        // the canonical path that matched
  | WindowsWellKnown(string)
  | PrivilegeEscape(string)       // an ancestor not owned + not world-readable

type verdict =
  | Allowed                       // not protected
  | Protected(matchedRule, resolvedPath: string)

let classify: (~directory: string) => verdict
// Resolves realpath, applies deny-list then privilege check, returns verdict.
```
Update `src/Cfg/ParseError.res` to add a `ProtectedDirRefused(matchedRule,
resolvedPath)` variant (this also satisfies the historical design #3000 gap
where ParseError was missing design-spec variants — obs #3014 finding 8).
**Verify**: `pnpm run build` → exit 0 (interface compiles; no behavior yet).

### Step A3: Review gate
Get architectural sign-off on the spec + interface (the reviewer is the
operator or a delegated `focused`/`heavy` reviewer). Do NOT start Phase B until
the spec is approved. Record approval in `plans/README.md`.

## Phase B — TDD implementation

### Step B1: Write failing unit tests (RED)
`tests/unit/protected_dir_test.res` (model after `auth_basic_test.res`):
1. `classify(~directory="/etc")` → `Protected(PosixWellKnown("/etc"), ...)`.
2. `classify(~directory="/usr/share/nginx/html")` → `Allowed`.
3. `classify` on a temp symlink whose target is `/etc` → `Protected(...)`
   with `resolvedPath` = realpath.
4. `classify(~directory= HOME )` → `Allowed`; `classify(~directory =
   path.join(HOME, ".ssh"))` → `Protected(PrivilegeEscape(...), ...)`
   (on POSIX; skip on Windows with a platform guard).
5. Relative path `./etc` resolved from `/` → protected (inject `cwd` or use
   `process.cwd()` and assert the resolved path).
6. A non-existent dir → the type calls `realpath` which throws; `classify`
   catches and returns `Protected` with a `ResolvedMissing`? — decide: the
   EXISTENCE preflight already fails before the guard, so `classify` may assume
   the dir exists; if realpath throws, return a `Protected(PrivilegeEscape,
   resolvedPath)` is WRONG — instead let `classify` re-raise a typed
   `ProtectedDirResolveError`. Document this in the spec.
Inject a fake `realpath` and `stat` where needed — follow the faking pattern
from `rate_limit_test`'s `now` injection. If `Belt` style doesn't allow easy
injection, extract the FS calls behind a small internal module you can replace
in tests.
**Verify**: `pnpm run test:unit -- tests/unit/protected_dir_test.res.mjs` →
cases FAIL (no implementation).

### Step B2: Implement `ProtectedDir.classify`
Implement the deny-list (POSIX + Windows), the privilege check (`fs.statSync`
owner uid/gid vs `process.getuid()`, plus world-readable bit), and the
`fs.realpathSync` resolution. Keep it pure aside from those FS reads.
**Verify**: `pnpm run build` → exit 0.

### Step B3: Wire the startup guard in `src/Httpath.res`
After the existing existence preflight and BEFORE `Http.startServer`/`listen`:
```
switch (ProtectedDir.classify(~directory=config.directory)) {
| Allowed => ()
| Protected(rule, resolved) =>
  if config.allowProtectedDir {
    Logger.warn("serving protected directory with --allow-protected-dir: " ++ resolved)
  } else {
    ParseError.raise(ProtectedDirRefused(rule, resolved))
  }
}
```
`Httpath.res`'s existing top-level `try ... catch` should format the actionable
message (from "Escape hatch UX" above) and `process.exit(1)`.
**Verify**: `pnpm run build` → exit 0.

### Step B4: Write the failing integration test (RED)
`tests/integration/protected_dir.test.mjs` (model after `lan_auth.test.mjs`):
1. `httpath -d /etc` (no flag) → child exits non-zero within 3 s; stderr contains
   `refusing to serve a protected system directory` and `--allow-protected-dir`.
2. `httpath -d /etc --allow-protected-dir` → child starts, listens, and the
   startup log contains a WARNING naming `/etc`; then kill it.
3. `httpath -d <tmpdir>` → starts normally (control case).
4. `httpath -d /usr/share/nginx/html` (skip if path missing on the runner) →
   starts normally OR skipped with a clear skip reason.
**Verify**: `node --test tests/integration/protected_dir.test.mjs` → cases 1–3
pass (RED before B3/GREEN after).

### Step B5: Wire + GREEN
Add `protected_dir.test.mjs` to `package.json:27` `test:integration`.
**Verify**: `pnpm run test:integration` → exit 0; `pnpm test` → exit 0.

### Step B6: Fix the README claim (land reality, not vaporware)
`README.md:126-128` already claims the guard. Verify the wording matches the
implemented behavior (refuses by default; `--allow-protected-dir` opts in with a
warning). Add the matched-rules examples (POSIX `/etc`, Windows `C:\Windows`)
and the realpath-symlink note. Cross-link to plan 006's doc style.
**Verify**: `grep -n "allow-protected-dir" README.md` → docs match behavior.

## Commands you will need

| Purpose | Command | Expected |
|---------|---------|----------|
| Build | `pnpm run build` | exit 0, zero warnings |
| Unit tests | `pnpm run test:unit` | exit 0 |
| Integration | `pnpm run test:integration` | exit 0 |
| Full gate | `pnpm test` | exit 0 |

## Scope (overall)

**In scope**:
- `sdd/protected-dir-guard/spec/lan-protected-dir.md` (new).
- `src/Security/ProtectedDir.res` + `.resi` (new).
- `src/Utils/Path.res`/`.resi` (only if reusing realpath helpers).
- `src/Cfg/ParseError.res` + `.resi` (`ProtectedDirRefused` variant).
- `src/Httpath.res` (preflight guard call + error formatting).
- `tests/unit/protected_dir_test.res` + `tests/integration/protected_dir.test.mjs` (new).
- `README.md` (align docs with behavior).

**Out of scope**:
- Per-request path protection (traversal/symlink — already shipped).
- TLS enforcement under LAN (plan 012).
- Health probes (plan 013).
- Any NEW CLI flag beyond the existing `--allow-protected-dir`.

## Git workflow

- Branch: `advisor/011-protected-dir-guard`.
- Conventional commits, one per phase: `spec(protected-dir): ...`,
  `feat(security): protected-directory startup guard`,
  `test(integration): protected-dir startup refusal/allow`,
  `docs: align protected-dir guard docs`. Match `git log` style.

## Done criteria

ALL must hold:

- [ ] `sdd/protected-dir-guard/spec/lan-protected-dir.md` exists and is reviewed.
- [ ] `src/Security/ProtectedDir.res` implements `classify` with deny-list +
      privilege check + realpath resolution.
- [ ] `src/Cfg/ParseError.res` has `ProtectedDirRefused`.
- [ ] `httpath -d /etc` refuses at startup (integration test passes).
- [ ] `httpath -d /etc --allow-protected-dir` starts with a logged warning.
- [ ] A symlink to `/etc` is caught via realpath.
- [ ] `pnpm test` exits 0; no new ReScript warnings.
- [ ] `README.md:126-128` matches implementation.
- [ ] `plans/README.md` row 011 set to DONE.

## STOP conditions

Stop and report (do not improvise) if:

- The spec review (Phase A3) returns changes to the deny-list or the privilege
  policy — revise the spec, don't code around it.
- `fs.realpathSync`/`fs.statSync` cannot be faked for unit tests without a
  large refactor — STOP and align on whether to inject an FS module or restrict
  coverage to integration tests.
- Windows is unavailable in CI — guard the Windows deny-list tests behind a
  platform check and document; don't skip the POSIX cases.
- A legitimate CI doc root your pipelines use turns out to be in the deny-list —
  STOP and revise the deny-list (don't silently allow it), recording the
  decision in the spec.
- The privilege check (`getuid`/`stat` ownership) is unreliable in containers
  (root in a container sees uid 0 for everything) — degrade to deny-list-only
  with a logged warning when `process.getuid() === 0` and the dir owner is also
  0; document the limitation in the spec, don't assert a false guarantee.

## Maintenance notes

- Future "serve a whole drive/partition" UX may want `--allow-protected-dir` to
  accept a scoped value (e.g. `--allow-protected-dir=~/only`). If added, the
  guard's verdict must re-evaluate against the scoped set — re-run plan 011's
  tests.
- Plan 012 (enforce TLS under LAN) reuses the same preflight path; keep the guard
  call site ordered so the protected-dir refusal precedes the TLS check (a
  misconfigured root is more urgent than a missing cert).
- The deny-list is OS-specific and will rot — add a maintenance comment in
  `ProtectedDir.res` pointing back to this spec's "What counts as protected"
  section so future maintainers update the spec AND the list together.

## Follow-ups

**D1 — WARNING (verify deviation):** `ProtectedDir.checkPrivilegeAncestors` is a
no-op: it always returns `None` regardless of uid, and the privilege-check warning
under `uid 0` is never logged (no `Js.Console.warn` / `Logger.warn` call exists).
The deny-list path works correctly, but REQ-PDG-003 / SCN-PDG-005 is only partially
met. Fix: extend the `Node.Fs.stats` binding to expose `mode`, `uid`, and `gid`
bits, then re-enable `checkPrivilegeAncestors` and log a warning when
`process.getuid() === 0`. Alternatively, remove `SCN-PDG-005` from spec #3081
until that binding lands. Neither path blocks plan 012 (TLS under LAN).