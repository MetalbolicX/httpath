# httpath — static file server for Node, written in ReScript

> A lightweight static file server with live-reload, directory listings, and smart
> file watching. Think `python -m http.server` with superpowers, compiled to a
> single zero-dependency bundle.

<p align="center">
  <img src="https://img.shields.io/badge/node->=18-brightgreen?logo=node.js&logoColor=white" alt="Node.js">
  <img src="https://img.shields.io/badge/rescript-11-blue?logo=rescript&logoColor=white" alt="ReScript">
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
pnpm @metalbolicx/httpath

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
pnpm @metalbolicx/httpath

# Specific directory and port
pnpm @metalbolicx/httpath -d ./my-project -p 3000

# Disable live reload and directory listing
pnpm @metalbolicx/httpath --no-live-reload --no-listing
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
- [ ] Range request support (partial content)
- [ ] Request logging to file
- [ ] HTTPS / TLS support

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
