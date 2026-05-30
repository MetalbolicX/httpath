# httpath — zero-dep static file server for Deno

> A lightweight, zero-dependency static file server with live-reload, directory
> listings, and smart file watching. Think `python -m
> http.server` with
> superpowers, in pure Deno.

<p align="center">
  <img src="https://img.shields.io/badge/deno->=2.0.0-272e33?logo=deno&logoColor=white" alt="Deno">
  <img src="https://img.shields.io/badge/license-MIT-blue" alt="License">
  <img src="https://img.shields.io/badge/TypeScript-5.x-3178c6" alt="TypeScript">
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
| Basic Auth        | ✅ (env-var based)                          | ❌                      | ❌               | ❌            |
| Dependencies      | **ZERO** (only `@std/*`)                    | Built-in                | 30+ npm          | 10+ npm       |
| Runtime           | Deno                                        | Python                  | Node             | Node          |

---

## Install

```sh
# Run directly (no install needed)
deno run -RN --allow-run --allow-env --sloppy-imports https://raw.githubusercontent.com/metalbolicx/httpath/main/httpath.ts

# Install globally
deno install -RN --allow-run --allow-env --sloppy-imports -n httpath https://raw.githubusercontent.com/metalbolicx/httpath/main/httpath.ts

# Or run from source
cp .env.example .env   # edit credentials (optional)
./httpath.ts
```

---

## Quick Start

```sh
# Serve the current directory (default: http://localhost:8080)
./httpath.ts

# Serve a specific directory on a custom port
./httpath.ts -d ./my-project -p 3000

# Disable live reload and directory listing
./httpath.ts --no-live-reload --no-listing
```

---

## CLI Reference

| Flag                      | Default                       | Description                                                   |
| ------------------------- | ----------------------------- | ------------------------------------------------------------- |
| `-d, --dir <path>`        | `.` (current dir)             | Directory to serve                                            |
| `--host <hostname>`       | `127.0.0.1`                   | Hostname to bind to (use `0.0.0.0` for LAN access)            |
| `-l, --lan`               | `false`                       | Bind to all network interfaces (`0.0.0.0`) for LAN access    |
| `-p, --port <n>`          | `8080`                        | Port to listen on (1–65535)                                   |
| `-i, --ignore <patterns>` | `.git,node_modules,.DS_Store` | Comma-separated patterns to exclude                           |
| `--no-listing`            | `false`                       | Disable directory listing (returns 403)                       |
| `--no-live-reload`        | `false`                       | Disable automatic browser refresh                             |
| `-r, --restart-on-change` | `false`                       | Legacy mode: restart server on **any** file change            |
| `--log <level>`           | `info`                        | One of: `info`, `debug`, `error`                              |
| `--allow-protected-dir`   | `false`                       | Allow serving system directories (`/etc`, `C:\Windows`, etc.) |
| `-h, --help`              |                               | Show help and exit                                            |

### Basic Auth (optional)

Set `HTTPATH_USER` and `HTTPATH_PASS` in a `.env` file to enable HTTP Basic Auth
for all endpoints (HTTP + WebSocket `/livereload`).

```sh
cp .env.example .env   # then edit the credentials
```

See [.env.example](.env.example).

### Smart Mode vs Legacy Mode

In **smart mode** (default), the watcher analyses file extensions:

| When you change…               | The server…                         |
| ------------------------------ | ----------------------------------- |
| `.ts`, `.json`, `deno.json`    | Restarts (config/runtime files)     |
| `.html`, `.css`, `.js`, `.png` | Reloads the browser only            |
| `.log`, `.txt`, etc.           | Does nothing (not a monitored type) |

In **legacy mode** (`--restart-on-change`), **any** file change triggers a full
server restart.

### LAN Access

To make httpath accessible from other machines on your local network, use the `--lan` flag (or `-l`):

```sh
httpath --lan
# Server binds to 0.0.0.0 and displays LAN URLs on startup:
# 📡 LAN access enabled
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

httpath protects you at four levels:

1. **Startup Guard** — Refuses to serve system directories (`/etc`, `/boot`,
   `C:\Windows`, etc.) unless `--allow-protected-dir` is passed.
2. **Traversal Prevention** — Paths like `../../../etc/passwd` are rejected
   before they reach the filesystem.
3. **Ignore Patterns** — Sensitive project directories (`.git`, `node_modules`)
   are automatically blocked, even when explicitly requested.
4. **Basic Auth** (optional) — When `HTTPATH_USER` / `HTTPATH_PASS` are set,
   every request requires a valid `Authorization: Basic <base64>` header. The
   live-reload WebSocket is also protected.

---

## Project Status

**Stable.** Used in daily development. All 137+ tests pass. Supports Linux,
macOS, and Windows.

---

## Architecture

For a deep dive into the internals — module map, Mermaid flow diagrams,
concurrency model, and all 12 design decisions with rationale — see:

➡️ [docs/architecture.md](docs/architecture.md)

> Covers: startup flow, HTTP request handling, file watcher decision matrix,
> live reload flow, 4-layer security model (including Basic Auth), concurrent
> `Promise.race` design, and why closures over classes, hoisted regex constants,
> server-side HTML injection, and env-var-based credentials.

---

## Development

```sh
deno task dev      # Run with file watching
deno task test     # Run the full test suite
deno task fmt      # Format code
deno task lint     # Lint code
```

---

## Roadmap

- [x] Static file serving with MIME detection
- [x] Directory listing with dark mode
- [x] Smart live reload (browser vs server restart)
- [x] HEAD request support
- [x] Protected system directory guard
- [x] Basic authentication
- [ ] Range request support (partial content)
- [ ] Request logging to file
- [ ] Basic authentication
- [ ] HTTPS / TLS support

---

## License

Released under the [MIT License](LICENSE) by
[José Martínez Santana](https://github.com/MetalbolicX).

---

## Contributing

Pull requests are welcome. Please open an issue first to discuss what you'd like
to change.

1. Fork the repo
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes
4. Push and open a Pull Request
