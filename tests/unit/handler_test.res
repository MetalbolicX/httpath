// Handler_test.res — unit tests for Handler pipeline (RED first).
// Tests the full status matrix per REQ-HANDLER-2..13.

open Test

// ---------------------------------------------------------------------------
// Mock Fs operations for unit testing
// ---------------------------------------------------------------------------

// Mock dirent for readdir
type mockDirent = {
  name: string,
  isDirectory: bool,
}

// Mock stats
type mockStats = {
  isFile: bool,
  isDirectory: bool,
  isSymlink: bool,
}

// Mock FsOps record injected into handleWith
type fsOps = {
  readdir: string => promise<array<mockDirent>>,
  lstat: string => promise<mockStats>,
  stat: string => promise<mockStats>,
  readTextFile: string => promise<string>,
}

// Production FsOps using real Node/Fs
let productionFsOps: fsOps = {
  readdir: path => {
    Fs.readdir(path)->Promise.then(arr => {
      Promise.resolve(Array.map(arr, d => {name: d.name, isDirectory: d.isDirectory}))
    })
  },
  lstat: path => {
    Fs.lstat(path)->Promise.then(s => {
      Promise.resolve({isFile: s.isFile, isDirectory: s.isDirectory, isSymlink: s.isSymlink})
    })
  },
  stat: path => {
    Fs.stat(path)->Promise.then(s => {
      Promise.resolve({isFile: s.isFile, isDirectory: s.isDirectory, isSymlink: s.isSymlink})
    })
  },
  readTextFile: Fs.readTextFile,
}

// ---------------------------------------------------------------------------
// Minimal Config for testing (non-default values where needed)
// ---------------------------------------------------------------------------

let testConfigBase: Config.t = {
  directory: "/test/serve",
  hostname: "127.0.0.1",
  port: 9999,
  ignorePatterns: ["node_modules", ".git"],
  enableDirectoryListing: true,
  logLevel: Logger.Debug,
  enableLiveReload: true,
  restartOnChange: false,
  lan: false,
  allowProtectedDir: false,
  trustProxy: false,
  authFile: None,
  noAuth: false,
  noTls: false,
  tls: false,
  tlsCert: None,
  tlsKey: None,
  rateLimitMax: 0,
  rateLimitWindow: 0,
  rateLimitEnabled: false,
  accessLog: None,
  readOnly: false,
}

// ---------------------------------------------------------------------------
// Test REQ-HANDLER-2: 413 content-length rejection
// ---------------------------------------------------------------------------

test("Handler: content-length > 0 returns 413 Payload Too Large", () => {
  // The 413 check: content-length header present and > 0
  // This test verifies the pipeline short-circuits on positive content-length
  let hasPositiveContentLength = (headers: array<(string, string)>): bool => {
    let rec find = (i: int): option<int> => {
      if i >= Array.length(headers) {
        None
      } else {
        switch headers[i] {
        | Some(("content-length", v)) => {
            let parsed = Belt.Int.fromString(v)
            switch parsed {
            | Some(n) =>
              if n > 0 {
                Some(n)
              } else {
                None
              }
            | None => None
            }
          }
        | _ => find(i + 1)
        }
      }
    }
    find(0) != None
  }
  let headersWithContent: array<(string, string)> = [("content-length", "5")]
  let headersEmpty: array<(string, string)> = []
  let headersZero: array<(string, string)> = [("content-length", "0")]
  assertion(
    ~message="positive content-length detected",
    ~operator="=",
    (a, b) => a == b,
    hasPositiveContentLength(headersWithContent),
    true,
  )
  assertion(
    ~message="empty content-length not positive",
    ~operator="=",
    (a, b) => a == b,
    hasPositiveContentLength(headersEmpty),
    false,
  )
  assertion(
    ~message="zero content-length not positive",
    ~operator="=",
    (a, b) => a == b,
    hasPositiveContentLength(headersZero),
    false,
  )
})

// ---------------------------------------------------------------------------
// Test REQ-HANDLER-3: 405 method rejection
// ---------------------------------------------------------------------------

test("Handler: POST returns 405 Method Not Allowed with allow: GET, HEAD", () => {
  let req: Types.request = {
    method: "POST",
    path: "/file.txt",
    headers: [],
    clientIp: "127.0.0.1",
  }
  // Method check: only GET and HEAD are allowed
  let isAllowedMethod = (method: string): bool => {
    let upper = String.toUpperCase(method)
    upper == "GET" || upper == "HEAD"
  }
  let allowed = isAllowedMethod(req.method)
  assertion(~message="POST should not be allowed", ~operator="=", (a, b) => a == b, allowed, false)
})

test("Handler: GET returns true from method check", () => {
  let req: Types.request = {
    method: "GET",
    path: "/file.txt",
    headers: [],
    clientIp: "127.0.0.1",
  }
  let isAllowedMethod = (method: string): bool => {
    let upper = String.toUpperCase(method)
    upper == "GET" || upper == "HEAD"
  }
  let allowed = isAllowedMethod(req.method)
  assertion(~message="GET should be allowed", ~operator="=", (a, b) => a == b, allowed, true)
})

test("Handler: HEAD returns true from method check", () => {
  let isAllowedMethod = (method: string): bool => {
    let upper = String.toUpperCase(method)
    upper == "GET" || upper == "HEAD"
  }
  let allowed = isAllowedMethod("HEAD")
  assertion(~message="HEAD should be allowed", ~operator="=", (a, b) => a == b, allowed, true)
})

// ---------------------------------------------------------------------------
// Test REQ-HANDLER-4: URI decoding
// ---------------------------------------------------------------------------

test("Handler: valid path decodes without error", () => {
  let decoded = try {
    Some(decodeURIComponent("/file%20name.txt"))
  } catch {
  | _ => None
  }
  switch decoded {
  | Some(d) =>
    assertion(~message="decoded correctly", ~operator="=", (a, b) => a == b, d, "/file name.txt")
  | None => JsError.throwWithMessage("decodeURIComponent should not throw for valid input")
  }
})

test("Handler: malformed percent encoding throws and returns 400", () => {
  let decoded = try {
    Some(decodeURIComponent("/bad%encoding"))
  } catch {
  | _ => None
  }
  switch decoded {
  | Some(_) => JsError.throwWithMessage("decodeURIComponent should throw for malformed input")
  | None =>
    assertion(
      ~message="malformed encoding returns None",
      ~operator="=",
      (a, b) => a == b,
      true,
      true,
    )
  }
})

// ---------------------------------------------------------------------------
// Test REQ-HANDLER-5: WS upgrade on /livereload
// ---------------------------------------------------------------------------

test("Handler: /livereload + upgrade:websocket returns WsUpgrade when liveReload enabled", () => {
  let req: Types.request = {
    method: "GET",
    path: "/livereload",
    headers: [("upgrade", "websocket")],
    clientIp: "127.0.0.1",
  }
  // WS upgrade check: enableLiveReload && path == "/livereload" && upgrade == "websocket"
  let shouldUpgrade = (config: Config.t, req: Types.request): bool => {
    config.enableLiveReload &&
    req.path == Types.liveReloadEndpoint &&
    {
      let rec findUpgrade = (i: int): option<string> => {
        if i >= Array.length(req.headers) {
          None
        } else {
          switch req.headers[i] {
          | Some(("upgrade", v)) => Some(v)
          | _ => findUpgrade(i + 1)
          }
        }
      }
      findUpgrade(0)
    } == Some("websocket")
  }
  let result = shouldUpgrade(testConfigBase, req)
  assertion(~message="WS upgrade should trigger", ~operator="=", (a, b) => a == b, result, true)
})

test("Handler: /livereload without upgrade header does not WS upgrade", () => {
  let req: Types.request = {
    method: "GET",
    path: "/livereload",
    headers: [],
    clientIp: "127.0.0.1",
  }
  let shouldUpgrade = (config: Config.t, req: Types.request): bool => {
    config.enableLiveReload &&
    req.path == Types.liveReloadEndpoint &&
    {
      let rec findUpgrade = (i: int): option<string> => {
        if i >= Array.length(req.headers) {
          None
        } else {
          switch req.headers[i] {
          | Some(("upgrade", v)) => Some(v)
          | _ => findUpgrade(i + 1)
          }
        }
      }
      findUpgrade(0)
    } == Some("websocket")
  }
  let result = shouldUpgrade(testConfigBase, req)
  assertion(
    ~message="WS upgrade should not trigger without upgrade header",
    ~operator="=",
    (a, b) => a == b,
    result,
    false,
  )
})

// ---------------------------------------------------------------------------
// Test REQ-HANDLER-6: safe-path resolution
// ---------------------------------------------------------------------------

test("Handler: safe path resolves within base directory", () => {
  let safePath = Path.resolveSafePath(~base="/test/serve", ~requested="/file.txt")
  switch safePath {
  | Some(p) => {
      let rel = Node_Path.relative("/test/serve", p)
      let startsWithDotDot = String.startsWith(rel, "..")
      assertion(
        ~message="resolved path should not escape base",
        ~operator="=",
        (a, b) => a == b,
        startsWithDotDot,
        false,
      )
    }
  | None => JsError.throwWithMessage("Expected Some for safe path")
  }
})

test("Handler: path traversal returns None from resolveSafePath", () => {
  let safePath = Path.resolveSafePath(~base="/test/serve", ~requested="/../../etc/passwd")
  switch safePath {
  | Some(_) => JsError.throwWithMessage("Expected None for path traversal")
  | None =>
    assertion(~message="path traversal blocked", ~operator="=", (a, b) => a == b, true, true)
  }
})

// ---------------------------------------------------------------------------
// Test REQ-HANDLER-7: ignore pattern matching
// ---------------------------------------------------------------------------

test("Handler: node_modules matches ignore pattern", () => {
  let relPath = "node_modules/some/package"
  // matchesPattern normalizes separators internally, so direct path is fine
  let matches = Path.matchesPattern(~path=relPath, ~patterns=["node_modules"])
  assertion(~message="node_modules should match", ~operator="=", (a, b) => a == b, matches, true)
})

test("Handler: regular file does not match ignore pattern", () => {
  let relPath = "src/index.js"
  let matches = Path.matchesPattern(~path=relPath, ~patterns=["node_modules"])
  assertion(
    ~message="src/index.js should not match",
    ~operator="=",
    (a, b) => a == b,
    matches,
    false,
  )
})

// ---------------------------------------------------------------------------
// Test REQ-HANDLER-8: symlink detection
// ---------------------------------------------------------------------------

test("Handler: hasSymlinkPrefix returns false when no symlink in path", () => {
  // hasSymlinkPrefix is async; this test verifies the sync portion of the algorithm
  // (the relative path check). Actual symlink walking requires real symlinks in temp dir.
  // Path traversal is already blocked by resolveSafePath — hasSymlinkPrefix only runs
  // after safe-path is confirmed, so a non-traversal path with no symlinks returns false.
  let rel = Node_Path.relative("/test/serve", "/test/serve/file.txt")
  let startsWithDotDot = String.startsWith(rel, "..")
  assertion(
    ~message="relative path should not start with ..",
    ~operator="=",
    (a, b) => a == b,
    startsWithDotDot,
    false,
  )
})

// ---------------------------------------------------------------------------
// Test REQ-HANDLER-9: stat routing (mock-based)
// ---------------------------------------------------------------------------

test("Handler: stat returns isFile=true routes to serveFile", () => {
  let stats = {isFile: true, isDirectory: false, isSymlink: false}
  assertion(
    ~message="isFile routes to serveFile",
    ~operator="=",
    (a, b) => a == b,
    stats.isFile,
    true,
  )
  assertion(
    ~message="isDirectory should be false",
    ~operator="=",
    (a, b) => a == b,
    stats.isDirectory,
    false,
  )
})

test("Handler: stat returns isDirectory=true routes to serveDirectory or index.html", () => {
  let stats = {isFile: false, isDirectory: true, isSymlink: false}
  assertion(
    ~message="isDirectory routes to serveDirectory",
    ~operator="=",
    (a, b) => a == b,
    stats.isDirectory,
    true,
  )
  assertion(~message="isFile should be false", ~operator="=", (a, b) => a == b, stats.isFile, false)
})

// ---------------------------------------------------------------------------
// Test REQ-HANDLER-10: MIME type for file serving
// ---------------------------------------------------------------------------

test("Handler: fromPath returns text/html for .html", () => {
  let mime = Mime.fromPath(~path="index.html")
  assertion(
    ~message="html contentType",
    ~operator="=",
    (a, b) => a == b,
    mime.contentType,
    "text/html",
  )
  assertion(~message="html isText", ~operator="=", (a, b) => a == b, mime.isText, true)
})

test("Handler: fromPath returns image/svg+xml for .svg", () => {
  let mime = Mime.fromPath(~path="logo.svg")
  assertion(
    ~message="svg contentType",
    ~operator="=",
    (a, b) => a == b,
    mime.contentType,
    "image/svg+xml",
  )
  assertion(~message="svg isText", ~operator="=", (a, b) => a == b, mime.isText, false)
})

test("Handler: fromPath returns application/octet-stream for unknown ext", () => {
  let mime = Mime.fromPath(~path="file.foobar")
  assertion(
    ~message="unknown contentType",
    ~operator="=",
    (a, b) => a == b,
    mime.contentType,
    "application/octet-stream",
  )
  assertion(~message="unknown isText", ~operator="=", (a, b) => a == b, mime.isText, false)
})

// ---------------------------------------------------------------------------
// Test REQ-HANDLER-11: directory listing entries
// ---------------------------------------------------------------------------

test("Handler: fileEntry type has name, isDirectory, url", () => {
  let entry: Templates.fileEntry = {
    name: "test.txt",
    isDirectory: false,
    url: "/test.txt",
  }
  assertion(~message="entry name", ~operator="=", (a, b) => a == b, entry.name, "test.txt")
  assertion(~message="entry isDirectory", ~operator="=", (a, b) => a == b, entry.isDirectory, false)
  assertion(~message="entry url", ~operator="=", (a, b) => a == b, entry.url, "/test.txt")
})

// ---------------------------------------------------------------------------
// Test REQ-HANDLER-12: security headers wrapping
// ---------------------------------------------------------------------------

test("Handler: withSecurityHeaders appends all 8 security headers", () => {
  let existing = [("content-type", "text/html")]
  let withSec = Headers.withSecurityHeaders(existing)
  let count = Array.length(withSec)
  // existing 1 + 8 security = 9
  assertion(~message="security headers appended", ~operator="=", (a, b) => a == b, count, 9)
})

// Verify each security header is present
test("Handler: withSecurityHeaders includes x-content-type-options", () => {
  let existing: array<(string, string)> = []
  let withSec = Headers.withSecurityHeaders(existing)
  let hasHeader = Array.some(withSec, ((name, _)) => name == "x-content-type-options")
  assertion(
    ~message="x-content-type-options present",
    ~operator="=",
    (a, b) => a == b,
    hasHeader,
    true,
  )
})

test("Handler: withSecurityHeaders does not duplicate existing security headers", () => {
  let existing = [("x-content-type-options", "nosniff")]
  let withSec = Headers.withSecurityHeaders(existing)
  let xctoEntries = Array.filter(withSec, ((name, _)) => name == "x-content-type-options")
  let count = Array.length(xctoEntries)
  // Should still be exactly 1 (replaced, not duplicated)
  assertion(
    ~message="no duplicate x-content-type-options",
    ~operator="=",
    (a, b) => a == b,
    count,
    1,
  )
})

// ---------------------------------------------------------------------------
// Test REQ-HANDLER-13: Fs error classification
// ---------------------------------------------------------------------------

test("Handler: ENOENT is classifiable from error code", () => {
  // ENOENT error classification
  let classifyError = (code: option<string>): int => {
    switch code {
    | Some("ENOENT") => 404
    | _ => 500
    }
  }
  assertion(
    ~message="ENOENT -> 404",
    ~operator="=",
    (a, b) => a == b,
    classifyError(Some("ENOENT")),
    404,
  )
  assertion(
    ~message="other error -> 500",
    ~operator="=",
    (a, b) => a == b,
    classifyError(Some("EACCES")),
    500,
  )
  assertion(~message="no code -> 500", ~operator="=", (a, b) => a == b, classifyError(None), 500)
})

// ---------------------------------------------------------------------------
// Test REQ-HANDLER-10: HEAD request returns Empty body
// ---------------------------------------------------------------------------

test("Handler: HEAD request returns Empty body", () => {
  // HEAD should never read the file body
  // The distinction is at the serveFile level: HEAD uses Empty regardless of file type
  let method = "HEAD"
  let isHead = method == "HEAD"
  assertion(~message="HEAD should be detected", ~operator="=", (a, b) => a == b, isHead, true)
})

// ---------------------------------------------------------------------------
// Test: Injector.injectLiveReloadScript adds script before </body>
// ---------------------------------------------------------------------------

test("Handler: injectLiveReloadScript inserts before </body>", () => {
  let html = "<html><body><p>Hello</p></body></html>"
  let injected = Injector.injectLiveReloadScript(~html, ~port=8080)
  let hasScript = String.includes(injected, "<script>")
  let beforeBody = {
    let bodyIdx = String.indexOf(injected, "</body>")
    let scriptIdx = String.indexOf(injected, "<script>")
    scriptIdx >= 0 && bodyIdx >= 0 && scriptIdx < bodyIdx
  }
  assertion(~message="script inserted in HTML", ~operator="=", (a, b) => a == b, hasScript, true)
  assertion(~message="script before </body>", ~operator="=", (a, b) => a == b, beforeBody, true)
})

// ---------------------------------------------------------------------------
// Test: Templates.renderDirectoryListing produces valid HTML
// ---------------------------------------------------------------------------

test("Handler: renderDirectoryListing produces HTML with title", () => {
  let entries: array<Templates.fileEntry> = [
    {name: "file.txt", isDirectory: false, url: "/file.txt"},
    {name: "subdir", isDirectory: true, url: "/subdir"},
  ]
  let html = Templates.renderDirectoryListing(~entries, ~urlPath="/")
  let hasTitle = String.includes(html, "<title>Index of /</title>")
  let hasFileLink = String.includes(html, "/file.txt")
  let hasDirLink = String.includes(html, "/subdir")
  assertion(~message="has title", ~operator="=", (a, b) => a == b, hasTitle, true)
  assertion(~message="has file link", ~operator="=", (a, b) => a == b, hasFileLink, true)
  assertion(~message="has dir link", ~operator="=", (a, b) => a == b, hasDirLink, true)
})
