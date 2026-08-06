# httpath — static file server for Node, written in ReScript

> A lightweight static file server with live-reload, directory listings, and smart
> file watching. Think `python -m http.server` with superpowers, compiled to a
> single zero-dependency bundle.

<p align="center">
  <img src="https://img.shields.io/badge/node->=22-brightgreen?logo=node.js&logoColor=white" alt="Node.js">
  <img src="https://img.shields.io/badge/rescript-12-blue?logo=rescript&logoColor=white" alt="ReScript">
  <img src="https://img.shields.io/badge/license-MIT-blue" alt="License">
  <img src="https://img.shields.io/badge/dependencies-none-brightgreen" alt="Dependencies">
</p>

---

## Why httpath?

**One command, zero config.** Point it at any directory — it serves files with
automatic MIME types, generates beautiful directory listings, and reloads your
browser the instant you save a change.

| Feature           | httpath                                     | `python -m http.server` | `serve` (Vercel) | `http-server` |
| ----------------- | ------------------------------------------- | ----------------------- | ---------------- | ------------- |
| Live reload       | ✅ Smart (server restart OR browser reload) | ❌                      | ❌               | ✅            |
| Directory listing | ✅ Beautiful HTML with dark mode            | ✅ Plain text           | ❌               | ✅            |
| File watching     | ✅ 2 modes: smart + legacy                  | ❌                      | ❌               | ❌            |
| HEAD requests     | ✅                                          | ❌                      | ❌               | ❌            |
| System dir guard  | ✅                                          | ❌                      | ❌               | ❌            |
| Dependencies      | **ZERO** runtime (Node built-ins only)       | Built-in                | 30+ npm          | 10+ npm       |
| Runtime           | Node                                        | Python                  | Node             | Node          |

Dev dependencies (`rescript`, `rolldown`) are only needed to build. The
published package (`dist/httpath.mjs`) has zero runtime dependencies.

---

## Install

```sh
# Run via pnpm (no install)
npx @metalbolicx/httpath

# Install globally
pnpm install -g @metalbolicx/httpath

# From source (this repo)
git clone https://github.com/metalbolicx/httpath.git && cd httpath && pnpm install && pnpm run build
node dist/httpath.mjs
```

---

## Quick Start

```sh
# Serve current directory on default port 8080
npx @metalbolicx/httpath

# Specific directory and port
npx @metalbolicx/httpath -d ./my-project -p 3000

# Disable live reload and directory listing
npx @metalbolicx/httpath --no-live-reload --no-listing
```

---

## CLI Reference

| Flag                      | Default                       | Description                                                   |
| ------------------------- | ----------------------------- | ------------------------------------------------------------- |
| `-d, --dir <path>`        | `.` (current dir)             | Directory to serve                                            |
| `--host <hostname>`       | `127.0.0.1`                   | Hostname to bind to (use `0.0.0.0` for LAN access)           |
| `-l, --lan`               | `false`                       | Bind to all network interfaces (`0.0.0.0`) for LAN access    |
| `-p, --port <n>`          | `8080`                        | Port to listen on (1–65535)                                  |
| `-i, --ignore <patterns>` | `.git,node_modules,.DS_Store` | Comma-separated patterns to exclude                          |
| `--no-listing`            | `false`                       | Disable directory listing (returns 403)                       |
| `--no-live-reload`        | `false`                       | Disable automatic browser refresh                            |
| `-r, --restart-on-change` | `false`                       | Legacy mode: restart server on **any** file change           |
| `--trust-proxy`           | `false`                       | Trust `X-Forwarded-For` headers from reverse proxies          |
| `--allow-protected-dir`   | `false`                       | Allow serving system directories (`/etc`, `C:\Windows`, etc.)|
| `--log <level>`           | `info`                        | One of: `info`, `debug`, `error`                             |
| `-h, --help`              |                               | Show help and exit                                            |

### Smart Mode vs Legacy Mode

In **smart mode** (default), the watcher analyses file extensions:

| When you change…               | The server…                         |
| ------------------------------ | ----------------------------------- |
| `.res`, `.json`, `package.json`| Restarts (config/runtime files)      |
| `.html`, `.css`, `.js`, `.png` | Reloads the browser only            |
| `.log`, `.txt`, etc.           | Does nothing (not a monitored type) |

In **legacy mode** (`--restart-on-change`), **any** file change triggers a full
server restart.

### LAN Access

To make httpath accessible from other machines on your local network, use the
`--lan` flag (or `-l`):

```sh
httpath --lan
# Server binds to 0.0.0.0 and displays LAN URLs on startup:
# LAN access enabled
#    http://192.168.1.42:8080 (eth0)
#    http://10.0.0.5:8080 (wlan0)
```

You can also manually set the hostname:

```sh
httpath --host 0.0.0.0
```

Any non-localhost binding (including `--lan` and `--host 0.0.0.0`) will trigger
the same LAN URL display on startup.

---

## Security

httpath protects you at three levels:

1. **Startup Guard** — Refuses to serve system directories (`/etc`, `/boot`,
   `C:\Windows`, etc.) unless `--allow-protected-dir` is passed.
2. **Traversal Prevention** — Paths like `../../../etc/passwd` are rejected
   before they reach the filesystem.
3. **Ignore Patterns** — Sensitive project directories (`.git`, `node_modules`)
   are automatically blocked, even when explicitly requested.

---

## LAN Security

When `--lan` is enabled, httpath applies additional hardening for hostile network
environments. These features are **opt-in** via flags; localhost is unaffected.

### Threat model

**What's protected:**

- LAN machines are prompted for HTTP Basic Auth before any file is served.
- Write methods (POST, PUT, DELETE, PATCH) are rejected with `405 Method Not Allowed`.
- The server is rate-limited to prevent brute-force and DoS attacks.
- All requests (including rejected ones) are written to a structured access log.
- **TLS/HTTPS is enabled by default under `--lan`** — traffic is encrypted.

**What's NOT protected (know your boundary):**

- If you use `--no-tls`, Basic Auth credentials are sent in plaintext over the LAN.
  httpath logs a loud warning when this happens.
- Authentication is HTTP Basic Auth over TLS — do not use weak passwords.
- The `.httpath-auth` file format uses scrypt but is not a full user management
  system. Rotate credentials if compromised.
- Rate limiting is per-process; restarted servers reset state.
- The access log grows indefinitely; rotate or truncate the file externally.

### Enabling LAN mode

```sh
# Minimal LAN server — TLS is enabled by default, requires auth credentials
httpath --lan

# LAN server without authentication (not recommended on untrusted LANs)
httpath --lan --no-auth

# LAN server without TLS — DANGER: credentials sent in plaintext
# httpath logs a WARNING when you use this:
#   WARNING: --lan without TLS exposes Basic Auth credentials in plaintext.
#     Use --tls-cert/--tls-key or remove --lan.
httpath --lan --no-tls
```

### LAN Security CLI flags

| Flag                        | Default              | Description                                                    |
| --------------------------- | -------------------- | -------------------------------------------------------------- |
| `--lan`                     | `false`              | Enable LAN security hardening (auth, rate-limit, read-only, TLS) |
| `--no-auth`                 | `false`              | Skip authentication requirement under `--lan`                   |
| `--auth-file <path>`        | `.httpath-auth`      | Path to scrypt-auth credential file (see below)                 |
| `--tls`                     | `false` (LAN: true)  | Enable HTTPS (auto-generates self-signed cert under `--lan`)     |
| `--no-tls`                  | `false`              | Disable TLS under `--lan` — logs WARNING about plaintext risk  |
| `--tls-cert <path>`         | auto-generate        | Path to PEM X.509 certificate for HTTPS                         |
| `--tls-key <path>`          | auto-generate        | Path to PEM private key for HTTPS                              |
| `--rate-limit`              | `false` (LAN default) | Enable per-IP request rate limiting                             |
| `--rate-limit-max <n>`      | `100` (LAN default)  | Maximum requests per IP per window                              |
| `--rate-limit-window <n>`   | `60000` (LAN default)| Rate limit window in milliseconds                              |
| `--access-log <path>`       | stdout (LAN default) | Append access log to a file                                    |
| `--read-only`               | `true` (LAN default) | Reject write methods (POST/PUT/DELETE/PATCH) with `405`        |

> **Note:** Under `--lan`, TLS is enabled by default (auto-generates a self-signed
> certificate). Use `--no-tls` only for debugging; credentials will be visible in
> plaintext on the LAN. `--rate-limit`, `--rate-limit-max`, `--rate-limit-window`,
> and `--read-only` are automatically set to secure defaults when `--lan` is used.
> Pass explicit values to override.

### Auth file format

httpath uses an `.httpath-auth` file with scrypt-hashed credentials. One entry
per line:

```
# Format: username:scryptParams$saltBase64$hashBase64
# Example:
alice:N=16384,r=8,p=1$YWJjZGVmZ2hpamtsbW5vcA==$YWJjZGVmZ2hpamtsbW5vcHFycXVzdHdxeg==
```

Lines starting with `#` and blank lines are ignored. The file must be readable
by the httpath process.

**Generating credentials:**

```sh
# Interactive (prompts for password securely)
node scripts/gen-auth.mjs alice

# Non-interactive (password as argument — less secure, for testing only)
node scripts/gen-auth.mjs alice mypassword
```

The script appends an entry to `.httpath-auth` in the current directory. It uses
`N=16384, r=8, p=1` scrypt parameters (CPU/memory hard) and generates a random
16-byte salt and 64-byte hash.

**Auth file search order:**

1. The path given to `--auth-file <path>` if provided.
2. `<served-directory>/.httpath-auth`.
3. `~/.config/httpath/auth`.

The first existing, parseable file wins. If none is found and `--lan` is on
without `--no-auth`, startup refuses and points at `scripts/gen-auth.mjs`.

### TLS / HTTPS

Generate a self-signed certificate on first run (requires `openssl` in PATH):

```sh
httpath --lan --tls
# Server listens on https:// instead of http://
# Certificate is auto-generated in ~/.httpath/
```

Or provide explicit certificate and key files:

```sh
httpath --lan --tls --tls-cert /path/to/cert.pem --tls-key /path/to/key.pem
```

> **openssl required for auto-TLS.** If `openssl` is not available in the
> server's `PATH`, you must provide `--tls-cert` and `--tls-key` explicitly.

### Access log format

Each line records one request in the format:

```
ISO8601 | ip | method | path | status | bytes
2026-08-04T07:44:10.000Z | 192.168.1.42 | GET | /index.html | 200 | 1234
```

Log format features:

- **ISO 8601 timestamps** for easy parsing.
- **CR/LF sanitization** — embedded newlines in request paths are replaced with `?`.
- **Rejections logged** — 401, 405, and 429 responses are also written to the log.
- **Per-process state** — rate limit counters reset when the server restarts.

---

## Project Status

**Stable.** Distributed as a single ESM bundle via npm. Supports Linux, macOS,
and Windows.

---

## Architecture

For a deep dive into the internals — module map, Mermaid flow diagrams,
concurrency model, and all design decisions with rationale — see:

➡️ [docs/architecture.md](docs/architecture.md)

> Covers: startup flow, HTTP request handling, file watcher decision matrix,
> live reload flow, 3-layer security model, concurrent `Promise.race` design,
> and why closures over classes, hoisted regex constants, and server-side HTML
> injection.

---

## Development

```sh
pnpm dev          # Watch ReScript compilation
pnpm run build        # One-shot build (rescript + rolldown)
pnpm test             # Build + unit + integration tests
pnpm run fmt          # Format code
pnpm run lint         # Lint code
```

---

## Roadmap

- [x] Static file serving with MIME detection
- [x] Directory listing with dark mode
- [x] Smart live reload (browser vs server restart)
- [x] HEAD request support
- [x] Protected system directory guard
- [x] LAN security (auth, rate-limit, read-only, TLS, access log)
- [ ] Range request support (partial content)

---

## License

Released under the [MIT License](LICENSE) by
[Jose Martinez Santana](https://github.com/MetalbolicX).

---

## Contributing

Pull requests are welcome. Please open an issue first to discuss what you'd like
to change.

1. Fork the repo
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes
4. Push and open a Pull Request
