# httpath

> **HTTPath** - A lightweight, feature-rich static file server similar to
> Python's `python -m http.server` but with only the standard Deno modules.

![Deno](https://img.shields.io/badge/deno->=2.0.0-green)
![License](https://img.shields.io/badge/license-MIT-blue)
![TypeScript](https://img.shields.io/badge/TypeScript-5.x-blue)

## ✨ Features

- 📁 Static File Streaming - Efficient file serving using Node.js streams
- 🎯 MIME Type Detection - Automatic content-type detection for common file
  types
- 📂 Directory Indexing - Beautiful directory listings with navigation
- 🔒 Path Sanitization - Built-in security against directory traversal attacks
- 🔄 Hot-Reload - Automatic browser refresh when files change
- **No Dependencies:** Built entirely on standard Deno modules (`@std/cli`,
  `@std/path`, `@std/media-types`).

## Prerequisites

- [Deno](https://deno.land/) 2.x or higher installed on your system.

## Usage

You can run `httpath` directly from the source or install it globally via Deno.

### Running from Source

Because Deno supports executing directly from a URL or local file, you can start
the server using the Deno task defined in the `deno.json`:

You can run directly:

```sh
./httpath.ts [OPTIONS]
```

**Options**

Usage: `httpath [OPTIONS]`

-d, --dir <directory> Directory to serve (default: current directory) -p, --port
<port> Port to listen on (default: 8080) -i, --ignore <patterns> Comma-separated
patterns to ignore (default: .git,node_modules,.DS_Store) --no-listing Disable
directory listing --no-live-reload Disable live reload feature -r,
--restart-on-change Restart server process on file changes (default: browser
reload only) --log <level> Log level: info, debug, error (default: info) -h,
--help Show this help message

## Examples

- Serve the current directory on port 8080:
  ```sh
  httpath
  ```

- Serve a specific directory on default port:
  ```sh
  httpath -d /path/to/directory
  ```

- Serve the current directory on port 8081:
  ```sh
  httpath -p 8081
  ```

## Arquitecture

```text
httpath/
├── deno.json                 # Deno tasks and standard library import maps
├── httpath.ts                   # Entry point and orchestrator
├── src/
│   ├── types.mts              # Shared interfaces (Config, FileEntry)
│   ├── cli/
│   │   └── parser.mts         # Argument parsing and defaults
│   ├── server/
│   │   ├── http.mts           # Request routing and static file serving
│   │   └── websocket.mts      # Live reload client state management
│   ├── watcher/
│   │   ├── monitor.mts        # File system watcher and debounce logic
│   │   └── rules.mts          # Rules for reloading vs restarting
│   ├── ui/
│   │   ├── templates.mts      # HTML/CSS generation for directory listing
│   │   └── injector.mts       # Live reload script generation and DOM injection
│   └── utils/
│       ├── logger.mts         # Console logging utility
│       ├── path.mts           # Path resolution and security
│       ├── mime.mts           # MIME type detection
│       └── debounce.mts       # Debounce utility
└── README.md                 # Project documentation
```

## 📋 Requirements

- **Deno** >= 2.0.0
- **Operating System**: Windows, macOS, Linux

## 🤝 Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add some amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## 📄 License

Released under [MIT License](LICENSE) by
[@MetalbolicX](https://github.com/MetalbolicX).

## 🔗 Related Projects

- [live-server](https://github.com/tapio/live-server) - Live reloading for
  development
- [http-server](https://github.com/http-party/http-server) - Simple HTTP server
- [serve](https://github.com/vercel/serve) - Static file serving and directory
  listing

---

<div align="center">
  Made with ❤️ by <a href="https://github.com/MetalbolicX">José Martínez Santana</a>
</div>
