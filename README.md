# httpath — zero-dep static file server for Deno

> **[paθ]** — /ˈeɪtʃ.tiː.pæθ/ — A lightweight, zero-dependency static file server
> with live-reload, directory listings, and smart file watching. Think `python -m
> http.server` with superpowers, in pure Deno.

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

| Feature | httpath | `python -m http.server` | `serve` (Vercel) | `http-server` |
|---------|---------|------------------------|------------------|---------------|
| Live reload | ✅ Smart (server restart OR browser reload) | ❌ | ❌ | ✅ |
| Directory listing | ✅ Beautiful HTML with dark mode | ✅ Plain text | ❌ | ✅ |
| File watching | ✅ 2 modes: smart + legacy | ❌ | ❌ | ❌ |
| HEAD requests | ✅ | ❌ | ❌ | ❌ |
| System dir guard | ✅ | ❌ | ❌ | ❌ |
| Dependencies | **ZERO** (only `@std/*`) | Built-in | 30+ npm | 10+ npm |
| Runtime | Deno | Python | Node | Node |

---

## Install

```sh
# Run directly (no install needed)
deno run -RN --allow-run --sloppy-imports https://raw.githubusercontent.com/metalbolicx/httpath/main/httpath.ts

# Install globally
deno install -RN --allow-run --sloppy-imports -n httpath https://raw.githubusercontent.com/metalbolicx/httpath/main/httpath.ts

# Or run from source
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

| Flag | Default | Description |
|------|---------|-------------|
| `-d, --dir <path>` | `.` (current dir) | Directory to serve |
| `-p, --port <n>` | `8080` | Port to listen on (1–65535) |
| `-i, --ignore <patterns>` | `.git,node_modules,.DS_Store` | Comma-separated patterns to exclude |
| `--no-listing` | `false` | Disable directory listing (returns 403) |
| `--no-live-reload` | `false` | Disable automatic browser refresh |
| `-r, --restart-on-change` | `false` | Legacy mode: restart server on **any** file change |
| `--log <level>` | `info` | One of: `info`, `debug`, `error` |
| `--allow-protected-dir` | `false` | Allow serving system directories (`/etc`, `C:\Windows`, etc.) |
| `-h, --help` | | Show help and exit |

### Smart Mode vs Legacy Mode

In **smart mode** (default), the watcher analyses file extensions:

| When you change… | The server… |
|------------------|-------------|
| `.ts`, `.json`, `deno.json` | Restarts (config/runtime files) |
| `.html`, `.css`, `.js`, `.png` | Reloads the browser only |
| `.log`, `.txt`, etc. | Does nothing (not a monitored type) |

In **legacy mode** (`--restart-on-change`), **any** file change triggers a full
server restart.

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

**Stable.** Used in daily development. All 130+ tests pass. Supports Linux,
macOS, and Windows.

---

## Architecture

For a deep dive into the internals — module map, Mermaid flow diagrams,
concurrency model, and all 10 design decisions with rationale — see:

➡️ [docs/architecture.md](docs/architecture.md)

> Covers: startup flow, HTTP request handling, file watcher decision matrix,
> live reload flow, 3-layer security model, concurrent `Promise.race` design,
> and why closures over classes, hoisted regex constants, and server-side HTML
> injection.

---

## Development

```sh
deno task dev      # Run with file watching
deno task test     # Run the full test suite
deno task fmt      # Format code
deno task lint     # Lint code
```

See [docs/workflow.md](docs/workflow.md) for the full development workflow.

---

## Roadmap

- [x] Static file serving with MIME detection
- [x] Directory listing with dark mode
- [x] Smart live reload (browser vs server restart)
- [x] HEAD request support
- [x] Protected system directory guard
- [ ] Range request support (partial content)
- [ ] Request logging to file
- [ ] Basic authentication
- [ ] HTTPS / TLS support

---

## License

Released under the [MIT License](LICENSE) by [José Martínez Santana](https://github.com/MetalbolicX).

---

## Contributing

Pull requests are welcome. Please open an issue first to discuss what you'd like
to change.

1. Fork the repo
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes
4. Push and open a Pull Request
