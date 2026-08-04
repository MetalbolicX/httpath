# Architecture

> **httpath** is a lightweight static file server for Node.js, written in
> ReScript and compiled to a single ESM bundle via Rolldown. This document
> describes the internal architecture, key flows, and the rationale behind every
> design decision.

---

## High-Level Overview

httpath follows a **layered architecture** with five distinct domains. Each
layer has a single responsibility and communicates through well-defined
interfaces (`Config`, function parameters).

```mermaid
graph TB
    subgraph "Entrypoint"
        A[bin.mjs] -->|Rolldown bundle| B[dist/httpath.mjs]
    end

    subgraph "CLI Layer"
        C[src/Cfg/Parser.res]
        D[src/Cfg/Config.res]
        E[src/Cfg/ParseError.res]
    end

    subgraph "Server Layer"
        F[src/Node/Http.res]
        G[src/Server/Handler.res]
    end

    subgraph "WebSocket Layer"
        H[src/Hub/WsHub.res]
        I[src/Http/WsHandshake.res]
    end

    subgraph "Watcher Layer"
        J[src/Watcher/Monitor.res]
        K[src/Watcher/Rules.res]
        L[src/Watcher/Restart.res]
        M[src/Watcher/IgnoreMatcher.res]
    end

    subgraph "UI Layer"
        N[src/Ui/Templates.res]
        O[src/Ui/Injector.res]
    end

    subgraph "Security Layer"
        P[src/Security/Headers.res]
    end

    subgraph "Utils Layer"
        Q[src/Utils/Logger.res]
        R[src/Utils/Path.res]
    end

    subgraph "Node FFI Layer"
        S[src/Node/Process.res]
        T[src/Node/Fs.res]
        U[src/Node/FsWatch.res]
        V[src/Node/Signals.res]
    end

    B -->|import| C
    B -->|import| F
    B -->|import| J
    F -->|HTTP response| N
    F -->|inject script| O
    F -->|WS upgrade| H
    J -->|evaluate rules| K
    J -->|notify clients| H
    K -->|pattern match| M
    N -->|escape HTML| N
    Q -.->|logging| B
    Q -.->|logging| F
    Q -.->|logging| J
```

---

## Module Map

| Layer           | Module                                                                        | Responsibility                                          | Key Exports                                                                 |
| --------------- | ----------------------------------------------------------------------------- | ------------------------------------------------------- | --------------------------------------------------------------------------- |
| **Entrypoint**  | `bin.mjs` (source) → `dist/httpath.mjs` (Rolldown bundle)                    | CLI entry; imports and runs Httpath                    | `main()`                                                                    |
| **Lifecycle**   | `src/Httpath.res`                                                             | Parse argv → HTTP server + Monitor + signals           | `main()`, startHttpServer(), startFileWatcher()                            |
| **CLI**         | `src/Cfg/Parser.res`                                                          | Argument parsing, defaults, validation                  | `parseArguments()`, `DEFAULT_CONFIG`                                        |
| **CLI**         | `src/Cfg/Config.res`                                                          | Config type definitions                                 | `Config`, config fields                                                     |
| **CLI**         | `src/Cfg/ParseError.res`                                                      | CLI error variants                                      | `ParseError`                                                                |
| **HTTP server** | `src/Node/Http.res`                                                           | Node `node:http` server + upgrade handling             | `createServer()`, `upgradeHandler()`                                        |
| **HTTP server** | `src/Server/Handler.res`                                                      | Request routing, file/directory serving                | `createRequestHandler()`                                                    |
| **WebSocket**   | `src/Hub/WsHub.res`                                                           | Live-reload client registry + notifications             | `addClient()`, `notifyClients()`                                            |
| **WebSocket**   | `src/Http/WsHandshake.res`                                                    | RFC 6455 WebSocket handshake                           | `isWsUpgrade()`, `performHandshake()`                                       |
| **Watcher**     | `src/Watcher/Monitor.res`                                                     | File watching, debounce, restart/reload dispatch       | `startFileWatcher()`                                                        |
| **Watcher**     | `src/Watcher/Rules.res`                                                       | Pure decision functions for restart vs. reload          | `shouldIgnoreEvent()`, `shouldRestartServer()`, `shouldTriggerBrowserReload()` |
| **Watcher**     | `src/Watcher/Restart.res`                                                      | Process spawn for server restart                       | `restartServer()`                                                           |
| **Watcher**     | `src/Watcher/IgnoreMatcher.res`                                                | Ignore pattern matching                                 | `shouldIgnore()`                                                            |
| **UI**          | `src/Ui/Templates.res`                                                         | HTML/CSS generation for directory listings              | `generateDirectoryListingHTML()`, `escapeHtml()`                            |
| **UI**          | `src/Ui/Injector.res`                                                          | Live-reload script generation and injection             | `getLiveReloadScript()`, `injectLiveReloadScript()`                         |
| **Security**    | `src/Security/Headers.res`                                                    | Security headers                                        | `setSecurityHeaders()`                                                       |
| **Utils**       | `src/Utils/Logger.res`                                                         | Leveled console logging                                 | `log()`, `setLogLevel()`                                                    |
| **Utils**       | `src/Utils/Path.res`                                                           | Path security, pattern matching                         | `resolveSafePath()`, `matchesPattern()`, `isProtectedSystemPath()`          |
| **Types**       | `src/Types.res`                                                                | Shared ReScript types and variants                      | `Config`, `FileEntry`, `LIVE_RELOAD_ENDPOINT`                               |
| **Node FFI**    | `src/Node/Process.res`, `Buffer.res`, `Crypto.res`, `Events.res`, `Fs.res`, `FsWatch.res`, `Node_Path.res`, `Signals.res`, `Timers.res`, `AbortController.res`, `Process_spawn.res` | Typed externals for Node built-ins | Direct bindings to `node:*` built-in modules               |

---

## Startup Flow

When the user runs `httpath`, the following sequence executes:

```mermaid
sequenceDiagram
    actor User
    participant Main as bin.mjs / dist/httpath.mjs
    participant Cfg as Cfg/Parser
    participant FS as Filesystem
    participant Server as Node/Http
    participant Watcher as Watcher/Monitor

    User->>Main: node dist/httpath.mjs -d ./public
    Main->>Cfg: parseArguments(process.argv)
    Cfg-->>Main: Config object
    Main->>Main: setLogLevel(config.logLevel)

    Note over Main: Validate directory exists
    Main->>FS: process.stat(config.directory)
    FS-->>Main: FileInfo

    alt isProtectedSystemPath(dir)
        Main-->>User: Error: protected system directory
    end

    Main->>Main: new AbortController()
    Main->>Main: setupSignalHandlers()

    par
        Main->>Server: startHttpServer(config, abortController)
        Note over Server: node:http.createServer() on config.port
    and
        Main->>Watcher: startFileWatcher(config, abortController)
        Note over Watcher: node:fs.watch (via Node/FsWatch)
    end

    Note over Main: Promise.race — both run concurrently
    Note over Main: Process stays alive until signal or error
```

---

## HTTP Request Handling

Every incoming request follows this decision tree:

```mermaid
flowchart TD
    A[Incoming Request] --> B{Method?}

    B -->|POST/PUT/DELETE| C[405 Method Not Allowed]
    B -->|GET/HEAD| D[Decode URL pathname]

    D --> E{WebSocket upgrade<br>for /livereload?}
    E -->|Yes| F[performHandshake<br>upgrade connection]
    E -->|No| G[resolveSafePath]

    G --> H{Path valid?<br>Inside serve root?}
    H -->|No| I[403 Forbidden]
    H -->|Yes| J{Matches<br>ignore pattern?}
    J -->|Yes| I
    J -->|No| K[process.stat]

    K --> L{Type?}
    L -->|File| M[serveFile]
    L -->|Directory| N{Directory listing<br>enabled?}

    N -->|Yes| O[serveDirectory<br>filter + sort entries]
    N -->|No| P{index.html<br>exists?}

    P -->|Yes| M
    P -->|No| Q[403 Forbidden]

    M --> R{HTML file?<br>Live-reload enabled?}
    R -->|Yes| S[injectLiveReloadScript]
    R -->|No| T[Stream file via process.stdin]

    S --> U[200 Response]
    T --> U
    O --> U

    K -->|NotFound| V[404 Not Found]
    K -->|Other error| W[500 Internal Server Error]
```

---

## File Watcher — Smart Mode

The watcher operates in two modes. **Smart mode** (default) analyses file
extensions to decide the action. **Legacy mode** (`-r` / `--restart-on-change`)
always restarts the server.

```mermaid
sequenceDiagram
    participant FS as Filesystem
    participant Watch as Watcher/Monitor
    participant Rules as Watcher/Rules
    participant WS as Hub/WsHub
    participant Child as child process

    FS-->>Watch: FsEvent (create/modify/remove)

    Watch->>Watch: shouldIgnoreEvent?
    alt ignored path
        Watch-->>Watch: skip
    end

    Watch->>Watch: isProcessingChange?
    alt already processing
        Watch-->>Watch: skip duplicate
    end

    Watch->>Watch: isProcessingChange = true
    Watch->>Watch: await debounceChange(500ms)

    alt restartOnChange (legacy mode)
        Watch->>WS: notifyClients("server restart")
        Watch->>Child: spawn new process + exit(0)
    else smart mode
        Watch->>Rules: shouldRestartServer(paths)?

        alt server restart
            Rules-->>Watch: true (e.g. .res, .json, package.json)
            Watch->>WS: notifyClients("server restart")
            Watch->>Child: spawn new process + exit(0)
        else browser reload
            Watch->>Rules: shouldTriggerBrowserReload(paths)?
            Rules-->>Watch: true (e.g. .html, .css, .png)
            Watch->>WS: notifyClients("frontend change")
        else no action
            Watch-->>Watch: log("not a monitored file type")
        end
    end

    Watch->>Watch: isProcessingChange = false
```

### Decision Matrix

| File Extension                                  | `shouldRestartServer` | `shouldTriggerBrowserReload` | Action                              |
| ----------------------------------------------- | :-------------------: | :--------------------------: | ----------------------------------- |
| `.res`, `.js`, `.mjs`                           |          ✅           |              ✅              | **Server restart** (takes priority) |
| `.json`                                         |          ✅           |              ✅              | **Server restart**                  |
| `.toml`, `.yaml`, `.yml`                        |          ✅           |              ❌              | **Server restart**                  |
| `package.json`, `rescript.json`, `rolldown.config.mjs` |     ✅        |              ❌              | **Server restart**                  |
| `.html`, `.css`                                 |          ❌           |              ✅              | **Browser reload**                  |
| `.scss`, `.sass`, `.less`                       |          ❌           |              ✅              | **Browser reload**                  |
| `.vue`, `.svelte`, `.tsx`, `.jsx`               |          ❌           |              ✅              | **Browser reload**                  |
| `.md`                                           |          ❌           |              ✅              | **Browser reload**                  |
| `.png`, `.jpg`, `.svg`, `.gif`, `.webp`, `.ico` |          ❌           |              ✅              | **Browser reload**                  |
| `.woff`, `.woff2`, `.ttf`, `.eot`               |          ❌           |              ✅              | **Browser reload**                  |
| `.log`, `.txt`, other                           |          ❌           |              ❌              | **No action**                       |

---

## Live Reload Flow

When the server injects a live-reload script into an HTML page, the browser
establishes a WebSocket connection. File changes trigger notifications:

```mermaid
sequenceDiagram
    participant Browser
    participant Server as HTTP Server
    participant WS as Hub/WsHub
    participant Watcher as Watcher/Monitor

    Note over Browser: GET /index.html
    Browser->>Server: HTTP GET
    Server->>Server: injectLiveReloadScript(html)
    Server-->>Browser: HTML with <script> block

    Note over Browser: Script runs immediately
    Browser->>WS: WebSocket connect /livereload
    WS->>WS: clients.add(socket)

    Note over Watcher: File change detected
    Watcher->>WS: notifyClients("frontend change")
    WS->>Browser: send("reload")
    Note over Browser: window.location.reload()

    Note over WS: Stale client cleanup
    WS->>WS: Remove clients with readyState !== OPEN
```

---

## Security Model

httpath has **three layers** of security:

```mermaid
flowchart LR
    subgraph "Layer 1: Startup Guard"
        A["isProtectedSystemPath()"] -->|Block /etc, /bin, /System, C:\Windows| B[Process exits with error]
    end

    subgraph "Layer 2: Traversal Prevention"
        C["resolveSafePath()"] -->|Normalise → Resolve → Relative check| D["Reject paths escaping serve root"]
    end

    subgraph "Layer 3: Ignore Patterns"
        E["matchesPattern()"] -->|Block .git, node_modules, .DS_Store| F["403 Forbidden"]
    end

    A -.->|User must opt-in| G["--allow-protected-dir"]
    C -->|"startsWith('..')"| D
```

### Layer Details

| Layer                    | Where                                 | What It Protects Against                        | How                                                                               |
| ------------------------ | ------------------------------------- | ----------------------------------------------- | --------------------------------------------------------------------------------- |
| **Startup Guard**        | `Httpath.res:main()`                  | Accidentally serving `/etc`, `C:\Windows`, etc. | Prefix-match against per-OS blocklist. Hard error unless `--allow-protected-dir`. |
| **Traversal Prevention** | `Utils/Path.res:resolveSafePath()`   | `../../etc/passwd` attacks                      | Resolve + normalize + check `relative()` starts with `..`.                        |
| **Ignore Patterns**      | `Server/Handler.res:isIgnoredPath()` | Serving `.git/`, `node_modules/`, `.DS_Store`   | Substring/suffix match against configurable patterns.                             |

---

## Concurrency Model

httpath runs two concurrent async tasks via `Promise.race`:

```mermaid
graph LR
    subgraph "Promise.race"
        A["startHttpServer()"]
        B["startFileWatcher()"]
    end

    A --> C["node:http.createServer()"]
    B --> D["node:fs.watch() (via Node/FsWatch)"]

    C --> E["AbortController.signal"]
    D --> E

    E -->|SIGINT / SIGTERM| F["Graceful shutdown"]
    E -->|Error| G["log + process.exit(1)"]
```

- Both tasks share an `AbortController` for coordinated shutdown.
- `Promise.race` ensures the process exits if **either** task throws.
- Signal handlers (`SIGINT`, `SIGTERM`) abort the controller and exit cleanly.
- On Windows, `SIGTERM` is unsupported — the error is caught silently.

---

## Design Decisions

### 1. Factory Pattern for Request Handler and Debouncer

**Decision:** `createRequestHandler(config)` and `createDebouncer()` return
closures rather than using classes.

**Rationale:**

- Closures capture `config` / internal state via lexical scope — no `this`
  binding issues, no class instantiation ceremony.
- The returned function is a plain `async (IncomingMessage, ServerResponse) => void`,
  compatible directly with `node:http.createServer()`.
- Each debouncer instance has isolated state (`pendingResolvers`, timeout
  handle), preventing cross-contamination between watcher and potential future
  consumers.

### 2. Separate Watcher Rules from Watcher Engine

**Decision:** `Watcher/Rules.res` exports pure functions (`shouldRestartServer`,
`shouldTriggerBrowserReload`). `Watcher/Monitor.res` contains the imperative
watcher loop.

**Rationale:**

- **Testability:** Rules are pure functions — trivially testable without
  filesystem mocking.
- **Single Responsibility:** `Monitor.res` handles debounce, concurrency guards,
  and process lifecycle. `Rules.res` handles file-extension classification.
- Rules can be swapped or extended without touching the watcher loop.

### 3. Hoisted Regex Constants

**Decision:** `SERVER_RESTART_PATTERNS` and `BROWSER_RELOAD_PATTERNS` are
module-level constants, not created inside functions.

**Rationale:**

- File-watch events are **hot** — regex arrays were being reconstructed on every
  call. Hoisting eliminates repeated allocation.
- Module-level constants are also easier to test and document.

### 4. Two-Level Debounce Strategy

**Decision:** A 500ms debounce on file events, plus an `isProcessingChange`
guard that resets immediately after processing (not via a fixed timer).

**Rationale:**

- File editors often save multiple files atomically (e.g., format-on-save
  touching 3 files). The 500ms debounce batches these into one event.
- The `isProcessingChange` flag prevents duplicate events from entering the
  critical section while debounce + restart/reload is still in-flight.
- Previous implementation used `setTimeout(1000)` in `finally` — this caused a
  race condition where the reset fired before processing completed.

### 5. Immutable Client Set (Encapsulated)

**Decision:** `liveReloadClients` is a private `Set<WebSocket>`, exposed only
through `handleWebSocket()` and `notifyClients()`.

**Rationale:**

- Exporting a mutable `Set` would let any consumer `.add()`, `.delete()`, or
  `.clear()` it, breaking the WebSocket lifecycle contract.
- `getClientCount()` provides read-only access for diagnostics.

### 6. Smart vs. Legacy Mode

**Decision:** Default is **smart mode** (restart only for server-side files,
browser reload for frontend files). `--restart-on-change` activates legacy mode.

**Rationale:**

- Most developers edit HTML/CSS/JS during development — restarting the server
  for these changes is unnecessary and slow.
- Config files (`.json`, `.yaml`, `package.json`) require a server restart because
  they affect runtime behavior.
- Legacy mode exists for edge cases where users want the old behavior.

### 7. HTML Injection Strategy

**Decision:** Live-reload script is injected **server-side** into HTML
responses, not loaded as an external file.

**Rationale:**

- No additional HTTP request for the script — zero latency.
- Works with any HTML file, even those without a `<head>` or explicit script
  includes.
- Injection order: `</body>` → `</html>` → append at end. This ensures the
  script runs after the DOM is ready.

### 8. Cross-Platform Protected Paths

**Decision:** Blocklist of system directories, selected at runtime via
`process.platform`. Case-insensitive on Windows.

**Rationale:**

- Path-based (no filesystem access required) — fast and deterministic.
- Prefix-match with separator ensures `/etc` blocks `/etc/nginx` but NOT
  `/etc-custom`.
- `/var`, `/opt`, `/usr`, `/tmp` are intentionally **not** blocked — they have
  legitimate development use cases.
- `--allow-protected-dir` provides an explicit escape hatch.

### 9. Zero External Runtime Dependencies

**Decision:** Only Node.js built-in modules (`node:http`, `node:fs`, `node:path`,
etc.) at runtime. Build tools (`rescript`, `rolldown`) are dev dependencies.

**Rationale:**

- Eliminates supply-chain risk — no `node_modules`, no transitive
  vulnerabilities beyond Node itself.
- Smaller bundle footprint.
- Node's built-in modules cover all required functionality.

### 10. In-Source ReScript Compilation

**Decision:** ReScript source files (`.res`) compile to `.res.mjs` in the same
`src/` directory, alongside source. Rolldown bundles from `bin.mjs`.

**Rationale:**

- No separate `lib/` or `build/` output directory to manage.
- `rescript.json` configures `suffix` as `.res.mjs` so compiled output is
  colocated with source.
- Rolldown takes `bin.mjs` as input and bundles all imports (including
  `src/**/*.res.mjs`) into `dist/httpath.mjs`.

### 11. AbortController for Coordinated Shutdown

**Decision:** A single `AbortController` is shared between the HTTP server and
file watcher. Both tasks monitor `signal` and clean up on abort.

**Rationale:**

- Standard web API — consistent with `fetch`, `EventTarget`, etc.
- No custom event bus or shared state object needed.
- SIGINT/SIGTERM handlers call `abort()` on the controller, and both tasks
  react independently.
- Works correctly on Node 18+.

---

## File Tree Reference

```text
httpath/
├── bin.mjs                     # Rolldown input — CLI entry point
├── dist/
│   └── httpath.mjs             # Published bundle (npm package entry)
├── package.json                # Dependencies, scripts, bin entry
├── rescript.json               # ReScript compiler config (suffix: .res.mjs)
├── rolldown.config.mjs         # Rolldown bundler config
├── src/
│   ├── Httpath.res             # Main lifecycle (main, startServer, startWatcher)
│   ├── Types.res               # Shared types: Config, FileEntry, LIVE_RELOAD_ENDPOINT
│   ├── Cfg/
│   │   ├── Config.res          # Config type
│   │   ├── Parser.res          # CLI argument parsing
│   │   └── ParseError.res      # CLI error variants
│   ├── Server/
│   │   └── Handler.res         # Request handler (file/directory serving)
│   ├── Hub/
│   │   └── WsHub.res            # WebSocket client registry
│   ├── Http/
│   │   └── WsHandshake.res      # RFC 6455 WebSocket handshake
│   ├── Node/
│   │   ├── Http.res            # node:http wrapper
│   │   ├── Fs.res              # node:fs wrappers
│   │   ├── FsWatch.res          # node:fs.watch wrapper
│   │   ├── Signals.res         # process.on('SIGINT'/'SIGTERM') wrapper
│   │   ├── Process_spawn.res   # child_process.spawn wrapper
│   │   └── ... (Buffer, Crypto, Events, Node_Path, Timers, AbortController)
│   ├── Watcher/
│   │   ├── Monitor.res         # File watcher + debounce + restart dispatch
│   │   ├── Rules.res           # Pure extension-based decision functions
│   │   ├── Restart.res         # Process restart logic
│   │   └── IgnoreMatcher.res   # Ignore pattern matching
│   ├── Ui/
│   │   ├── Templates.res       # HTML/CSS directory listing generation
│   │   └── Injector.res        # Live-reload script injection
│   ├── Security/
│   │   └── Headers.res         # Security headers
│   └── Utils/
│       ├── Logger.res           # Leveled logging
│       └── Path.res             # Path security + pattern matching
├── tests/                       # Unit + integration tests (node --test)
└── docs/
    ├── architecture.md          # This file
    └── workflow.md              # Development workflow
```
