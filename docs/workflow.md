# HTTPATH CLI Workflow

## Overview

**httpath** is a Deno-based static file server with live reload capabilities, similar to `python -m http.server` but with WebSocket-powered browser auto-refresh and optional server restart-on-change. It is configured entirely via CLI flags.

## Architecture

The application consists of the following key modules:

| Module | File | Responsibility |
|--------|------|-----------------|
| Entrypoint | `httpath.ts` | Orchestration: CLI parsing, signal handling, concurrent launch |
| CLI Parser | `src/cli/parser.mts` | CLI flag parsing into typed `Config` object |
| HTTP Server | `src/server/http.mts` | Request handling, MIME types, directory listing |
| WebSocket | `src/server/websocket.mts` | Live reload WS management |
| File Watcher | `src/watcher/monitor.mts` | FS monitoring, debouncing, restart/reload decisions |
| File Rules | `src/watcher/rules.mts` | File type classification for reload strategy |
| UI Templates | `src/ui/templates.mts` | Directory listing HTML |
| Script Injector | `src/ui/injector.mts` | Live reload script injection |
| Utilities | `src/utils/` | Path safety, MIME detection, logging, debounce |

## CLI Workflow Diagram

```mermaid
flowchart TD
    A([Start: httpath.ts]) --> B[parseArguments\nsrc/cli/parser.mts]

    B --> B1{"--help flag?"}
    B1 -->|Yes| B2[Print help & exit]
    B1 -->|No| B3[Resolve Config\ndir · port · ignore · logLevel\nlistings · liveReload · restart]

    B3 --> C[setLogLevel\nsrc/utils/logger.mts]
    C --> D[Deno.stat config.directory]
    D --> D1{"Directory exists?"}
    D1 -->|No| D2[Error & exit]
    D1 -->|Yes| E[setupSignalHandlers\nSIGINT · SIGTERM → abort]

    E --> F[Promise.race]

    F --> G[startFileWatcher\nsrc/watcher/monitor.mts]
    F --> H[startHttpServer\nsrc/server/http.mts]

    G --> G1[Deno.watchFs config.directory]
    G1 --> G2[for await event]
    G2 --> G3[shouldIgnoreEvent?\nsrc/watcher/rules.mts]
    G3 -->|Ignored| G2
    G3 -->|Not ignored| G4[debounce 500 ms\nsrc/utils/debounce.mts]

    G4 --> G5{"restartOnChange\nflag set?"}

    G5 -->|Yes| G6[notifyLiveReloadClients\n'server restart'\nsrc/server/websocket.mts]
    G6 --> G7[reloadServer\nDeno.execPath + Deno.exit]

    G5 -->|No smart mode| G8{"shouldRestartServer?\n.ts .js .json .toml …}
    G8 -->|Yes| G6
    G8 -->|No| G9{"shouldTriggerBrowserReload?\n.html .css .js .vue …}
    G9 -->|Yes| G10[notifyLiveReloadClients\n'frontend change']
    G10 --> G2
    G9 -->|No| G11[log: no action]
    G11 --> G2

    H --> H1[Deno.serve\nport · signal · handler]
    H1 --> H2[Incoming Request]

    H2 --> H3{"Method\nGET / HEAD?"}
    H3 -->|No| H4[405 Method Not Allowed]
    H3 -->|Yes| H5{"Upgrade: websocket\n+ /livereload path?"}

    H5 -->|Yes| H6[handleWebSocket\nsrc/server/websocket.mts]
    H6 --> H7[Add to liveReloadClients Set]
    H7 --> H8[WS connected → awaits 'reload' msg]

    H5 -->|No| H9[resolveSafePath\nsrc/utils/path.mts]
    H9 --> H10{"Traversal\ndetected?"}
    H10 -->|Yes| H11[403 Forbidden]
    H10 -->|No| H12{"Path matches\nignore patterns?"}
    H12 -->|Yes| H11
    H12 -->|No| H13[Deno.stat safe path]

    H13 --> H14{"Stat result"}
    H14 -->|Not found| H15[404 Not Found]
    H14 -->|Error| H16[500 Internal Error]
    H14 -->|File| H17[serveFile\nstream bytes]
    H14 -->|Directory| H18{"enableDirectory\nListing?"}

    H18 -->|No, index.html exists| H17
    H18 -->|No, no index.html| H11
    H18 -->|Yes| H19[serveDirectory\nsrc/ui/templates.mts\nHTML listing]

    H17 --> H20{"Is HTML file &\nenableLiveReload?"}
    H20 -->|Yes| H21[injectLiveReloadScript\nsrc/ui/injector.mts]
    H20 -->|No| H22[Response with\nMIME type header\nsrc/utils/mime.mts]
    H21 --> H22

    H19 --> H22
    H22 --> BR[Browser receives response]
    BR --> BR1{"HTML with\nlive reload script?"}
    BR1 -->|Yes| BR2[WS connect to\nws://host:port/livereload]
    BR2 --> H7
    BR1 -->|No| BR3[Render normally]

    G10 --> WS[notifyLiveReloadClients\nbroadcast 'reload']
    WS --> H8
    H8 --> RLD[window.location.reload]

    SIG(["SIGINT / SIGTERM"]) --> ABORT[abortController.abort]
    ABORT --> G2
    ABORT --> H1
    G2 -->|signal aborted| DONE([Process exits cleanly])
    H1 -->|signal aborted| DONE

    style A fill:#4a90d9,color:#fff
    style DONE fill:#27ae60,color:#fff
    style D2 fill:#e74c3c,color:#fff
    style B2 fill:#95a5a6,color:#fff
    style H4 fill:#e67e22,color:#fff
    style H11 fill:#e67e22,color:#fff
    style H15 fill:#e67e22,color:#fff
    style H16 fill:#e74c3c,color:#fff
    style G7 fill:#8e44ad,color:#fff
```

## Module Dependency Graph

```mermaid
flowchart LR
    httpath["httpath.ts"]
    cli["src/cli/parser.mts"]
    utils["src/utils/"]
    server["src/server/"]
    watcher["src/watcher/"]
    ui["src/ui/"]

    httpath --> cli
    httpath --> utils
    httpath --> server
    httpath --> watcher

    server --> utils
    server --> ui
    server --> ws["src/server/websocket.mts"]

    watcher --> utils
    watcher --> rules["src/watcher/rules.mts"]
    watcher --> ws

    subgraph utils
        logger["logger.mts"]
        debounce["debounce.mts"]
        path["path.mts"]
        mime["mime.mts"]
    end

    subgraph ui
        templates["templates.mts"]
        injector["injector.mts"]
    end
```

## Key Design Patterns

### AbortController Pattern

Both the HTTP server and file watcher honor the same `AbortController` signal, enabling coordinated graceful shutdown from a single source (signal handler).

```mermaid
sequenceDiagram
    participant SIG as OS Signal (SIGINT/SIGTERM)
    participant httpath as httpath.ts
    participant watcher as File Watcher
    participant server as HTTP Server

    SIG->>httpath: Signal received
    httpath->>httpath: abortController.abort()
    httpath-->>watcher: signal.aborted = true
    httpath-->>server: signal.aborted = true
    watcher->>watcher: break loop
    server->>server: stop serving
    httpath->>httpath: Deno.exit(0)
```

### Smart Reload vs Legacy Mode

- `restartOnChange=false` (default) uses file-type classification to decide between browser refresh (frontend files) and server restart (config/code files)
- `restartOnChange=true` restarts for any file change

```mermaid
flowchart TD
    F["File changed"] --> I{shouldIgnoreEvent?}
    I -->|Yes| DONE["No action"]
    I -->|No| M{"restartOnChange?"}
    M -->|Yes| RESTART["Full server restart"]
    M -->|No| C{File type?}
    C -->|"config/code (.ts .js .json .toml …)"| RESTART
    C -->|"frontend (.html .css .js .vue …)"| RELOAD["Browser reload only"]
    C -->|"other"| DONE
    RELOAD --> WS["notifyLiveReloadClients()"]
    RESTART --> WS
    WS --> WSBR["broadcast 'reload'"]
```

### WebSocket Live Reload Protocol

```mermaid
sequenceDiagram
    participant Browser
    participant Server as HTTP Server
    participant WS as WebSocket Server

    Browser->>Server: GET /index.html
    Server-->>Browser: HTML + injected liveReloadScript
    Note over Browser: Script connects to ws://host/livereload
    Browser->>WS: WebSocket upgrade request
    WS-->>Browser: 101 Switching Protocols
    Note over Browser,WS: WebSocket connection established

    alt Config file changed (.ts .js .json)
        Watcher->>WS: notifyLiveReloadClients('server restart')
        WS-->>Browser: 'reload'
        Browser->>Browser: window.location.reload()
    else Frontend file changed (.html .css .js)
        Watcher->>WS: notifyLiveReloadClients('frontend change')
        WS-->>Browser: 'reload'
        Browser->>Browser: window.location.reload()
    end
```

## CLI Flags Reference

| Flag | Alias | Type | Default |
|------|-------|------|---------|
| `--dir` | `-d` | string | `Deno.cwd()` |
| `--port` | `-p` | number | `8080` |
| `--ignore` | `-i` | string (comma-separated) | `.git,node_modules,.DS_Store` |
| `--no-listing` | — | boolean | `false` |
| `--no-live-reload` | — | boolean | `false` |
| `--restart-on-change` | `-r` | boolean | `false` |
| `--log` | — | string | `"info"` |
| `--help` | `-h` | boolean | `false` |

## File Classification Rules

### Files triggering full server restart

```mermaid
pie title Restart server on change
    "TypeScript" : 40
    "JavaScript" : 30
    "Config files" : 30
```

- `.ts`, `.js`, `.mjs`
- `.json`, `.toml`, `.yaml`, `.yml`
- `deno.json`, `deno.lock`, `package.json`

### Files triggering browser reload

- `.html`, `.htm`
- `.css`, `.scss`, `.sass`, `.less`
- `.js`, `.jsx`, `.ts`, `.tsx`
- `.vue`, `.svelte`
- `.md` (markdown)
- Images: `.png`, `.jpg`, `.jpeg`, `.gif`, `.svg`, `.webp`
- Fonts: `.woff2`, `.woff`, `.ttf`, `.eot`
