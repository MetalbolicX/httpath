# Core Features for Your Node.js Minimalist Server

1. **Static File Streaming** The server must read files from the disk and stream them to the HTTP response. Using `fs.createReadStream` is more memory-efficient than `fs.readFile` for larger assets.
2. **MIME Type Mapping** Unlike Python, a raw Node.js server doesn't automatically know that a `.css` file should be served as `text/css`. You will need a small lookup object to map file extensions to their correct `Content-Type`.
3. **Directory Indexing** If a user requests a directory (e.g., `/images/`), the server should:
    - Look for an `index.html` first.
    - If not found, generate a basic HTML page listing all files and folders in that directory with clickable links.
4. **Path Sanitization** To prevent security risks (like someone requesting `../../etc/passwd`), you must resolve the requested URL and ensure the resulting path still resides within your "root" directory.
5. **The Hot-Reload Flag (`--reload`)** This is the trickiest part without `npm`. To achieve this, your script will need:
    - **File Watching:** Use `fs.watch` to monitor the directory for changes.
    - **Client Signaling:** A small snippet of JavaScript injected into HTML files that opens a `new EventSource('/reload-monitor')`.
    - **Server-Sent Events (SSE):** A specific route in your Node server that keeps a connection open and sends a "reload" message whenever `fs.watch` detects a change.

# Suggested Feature Checklist

| Feature                    | Description                                              | Node Module                |
| -------------------------- | -------------------------------------------------------- | -------------------------- |
| **CLI Arguments**          | Handle `--port`, `--path`, and `--reload`                | `process.argv` `parseArgs` |
| **Route Handling**         | Distinguish between file requests and the reload trigger | `http`                     |
| **Automatic Port Finding** | If the default port is busy, try the next one            | `net`                      |
| **Logging**                | Print requested URLs and status codes to the console     | `console`                  |
| **Graceful Shutdown**      | Close connections cleanly when `Ctrl+C` is pressed       | `process.on('SIGINT')`     |
# Feature List: The "DIY-Python-Server"

| Feature                | Detail                                                                                                        |
| ---------------------- | ------------------------------------------------------------------------------------------------------------- |
| **Path Resolution**    | Maps URL paths to your local file system, defaulting to the current working directory (`process.cwd()`).      |
| **MIME Type Support**  | Basic dictionary to ensure `.html`, `.js`, `.css`, and `.png` files are recognized by the browser.            |
| **Directory Indexing** | Automatically serves `index.html` if it exists, or generates a dynamic HTML list of files if it doesn't.      |
| **Hot-Reload (SSE)**   | Uses **Server-Sent Events** to tell the browser to refresh without needing a WebSocket library.               |
| **Script Injection**   | On-the-fly modification of HTML files to insert a small "listener" script when the `--reload` flag is active. |
| **Security**           | Prevents "Directory Traversal" attacks (ensuring users can't `GET /../../etc/passwd`).                        |

# The Pseudocode

Here is the architectural logic for your script. This avoids specific syntax quirks and focuses on the "how."

```text
IMPORT http, fs, path, watch from 'node'

// 1. CONFIGURATION
PARSE arguments (port, root directory, reload-flag)
DEFINE mimeTypes = { '.html': 'text/html', '.js': 'text/javascript', ... }

// 2. THE HOT-RELOAD HUB (only if reload-flag is true)
CREATE an EventEmitter to manage connected browser clients
IF reload-flag:
    WATCH root directory recursively
    ON change:
        EMIT 'refresh' signal to all connected clients

// 3. THE SERVER LOGIC
CREATE http.createServer((request, response) => {
    
    // Handle the special Reload Endpoint
    IF request.url is '/__reload__':
        SET headers for Server-Sent Events (keep connection open)
        LISTEN for 'refresh' signal from our Hub
        ON 'refresh': SEND "data: reload" to browser
        RETURN

    // Resolve File Path
    FILE_PATH = path.join(root, request.url)
    IF FILE_PATH is outside root: RETURN 403 Forbidden

    IF FILE_PATH is directory:
        IF 'index.html' exists: FILE_PATH = path.join(FILE_PATH, 'index.html')
        ELSE: GENERATE HTML list of files and SEND

    // Serve the File
    IF FILE_PATH exists:
        GET extension and MIME type
        READ file content
        
        IF reload-flag is true AND file is HTML:
            INJECT <script> that connects to '/__reload__' and calls location.reload()
        
        SEND 200 OK with content and MIME type
    ELSE:
        SEND 404 Not Found
})

// 4. START
LISTEN on Port
PRINT "Serving [path] at http://localhost:[port]"
```

### Why use Server-Sent Events (SSE) instead of WebSockets?

Since you want to use **standard utilities only**, WebSockets are a pain because they require a complex "handshake" and frame masking logic that isn't built into the basic `http` module. **SSE**, however, is just a regular HTTP request that stays open and receives text—perfect for a simple "reload" command.

### 🏛️ The High-Level Architecture

The server operates as a **Request-Response pipeline** with a background **File Watcher** for the reload functionality.

```text
[ CLI Interface ]  <-- (User inputs: --port, --path, --reload)
      |
      v
[ HTTP Server ] <--------------------[ Event Hub ]
      |          (Listens for changes)      ^
      |                                     |
      +--> [ Security Filter ]              |
      |     (Prevents ../ path escapes)      |
      |                                     |
      +--> [ Router/Static Provider ]       |
      |     (Reads disk / Mappings)         |
      |                                     |
      +--> [ HTML Injector ]                |
            (Adds SSE script if --reload)   |
                                            |
[ FS Watcher ] -----------------------------+
(Monitors files and pings the Event Hub)
```

### 🧩 Component Breakdown

|Layer|Responsibility|Standard Utility|
|---|---|---|
|**CLI & Config**|Parses `process.argv`. Sets the root directory and port.|`process`|
|**The Watcher**|Recursively watches the directory for `change` events.|`fs.watch`|
|**The Event Hub**|A central `EventEmitter` that notifies active browser connections to reload.|`events`|
|**Static Handler**|Resolves URLs to absolute paths. Checks if a path is a file or a directory.|`path`, `fs/promises`|
|**The Middleware**|Before sending `.html`, it injects a tiny client-side script via string replacement.|`buffer` or `string`|
|**SSE Stream**|Keeps a long-lived HTTP connection open for the `--reload` flag.|`http` (Response)|
### 🔄 The "Hot-Reload" Signal Flow

1. **Server Start:** If `--reload` is passed, start `fs.watch(dir)`.
2. **Browser Connection:** The browser loads `index.html`. It sees an injected `<script>` that says `new EventSource('/__reload')`.
3. **The Handshake:** The browser opens a permanent request to `/__reload`. The server stores this `response` object in a `Set`.
4. **The Trigger:** You save a file. `fs.watch` fires.
5. **The Broadcast:** The server loops through the `Set` of responses and writes `data: reload\n\n` to each.
6. **The Refresh:** The browser receives the message and calls `window.location.reload()`.
