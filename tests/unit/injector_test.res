// injector_test.res — unit tests for Ui/Injector per REQ-INJECTOR-2..3.

open Test

// ---------------------------------------------------------------------------
// REQ-INJECTOR-2: liveReloadScript contains protocol selection and endpoint
// ---------------------------------------------------------------------------

test("Injector.liveReloadScript: contains ws: protocol for http", () => {
  let script = Injector.liveReloadScript(~port=5173)
  assertion(
    ~message="contains ws:",
    ~operator="=",
    (a, b) => a == b,
    String.includes(script, "ws:"),
    true,
  )
})

test("Injector.liveReloadScript: contains wss: protocol for https", () => {
  let script = Injector.liveReloadScript(~port=5173)
  assertion(
    ~message="contains wss:",
    ~operator="=",
    (a, b) => a == b,
    String.includes(script, "wss:"),
    true,
  )
})

test("Injector.liveReloadScript: contains location.protocol check", () => {
  let script = Injector.liveReloadScript(~port=5173)
  assertion(
    ~message="checks location.protocol",
    ~operator="=",
    (a, b) => a == b,
    String.includes(script, "window.location.protocol"),
    true,
  )
})

test("Injector.liveReloadScript: contains the livereload endpoint path", () => {
  let script = Injector.liveReloadScript(~port=5173)
  assertion(
    ~message="contains /livereload",
    ~operator="=",
    (a, b) => a == b,
    String.includes(script, Types.liveReloadEndpoint),
    true,
  )
})

test("Injector.liveReloadScript: contains the liveReloadMessage check", () => {
  let script = Injector.liveReloadScript(~port=5173)
  assertion(
    ~message="contains reload message check",
    ~operator="=",
    (a, b) => a == b,
    String.includes(script, "if (event.data === '" ++ Types.liveReloadMessage ++ "')"),
    true,
  )
})

test("Injector.liveReloadScript: contains reload() call", () => {
  let script = Injector.liveReloadScript(~port=5173)
  assertion(
    ~message="contains window.location.reload",
    ~operator="=",
    (a, b) => a == b,
    String.includes(script, "window.location.reload()"),
    true,
  )
})

test("Injector.liveReloadScript: contains 1000ms reconnect delay", () => {
  let script = Injector.liveReloadScript(~port=5173)
  assertion(
    ~message="contains 1000ms timeout",
    ~operator="=",
    (a, b) => a == b,
    String.includes(script, "setTimeout(connect, 1000)"),
    true,
  )
})

test("Injector.liveReloadScript: is wrapped in IIFE", () => {
  let script = Injector.liveReloadScript(~port=5173)
  assertion(
    ~message="starts with (() =>",
    ~operator="=",
    (a, b) => a == b,
    String.includes(script, "(() => {"),
    true,
  )
  assertion(
    ~message="ends with })();",
    ~operator="=",
    (a, b) => a == b,
    String.includes(script, "})();"),
    true,
  )
})

test("Injector.liveReloadScript: wrapped in script tag", () => {
  let script = Injector.liveReloadScript(~port=5173)
  assertion(
    ~message="starts with <script>",
    ~operator="=",
    (a, b) => a == b,
    String.includes(script, "<script>"),
    true,
  )
  assertion(
    ~message="ends with </script>",
    ~operator="=",
    (a, b) => a == b,
    String.includes(script, "</script>"),
    true,
  )
})

// ---------------------------------------------------------------------------
// REQ-INJECTOR-3: injectLiveReloadScript insertion positions
// ---------------------------------------------------------------------------

test("injectLiveReloadScript: inserts before </body> when present", () => {
  let html = "<html><body><p>Hello</p></body></html>"
  let result = Injector.injectLiveReloadScript(~html, ~port=5173)
  // Should contain the script before </body>
  assertion(
    ~message="contains </body>",
    ~operator="=",
    (a, b) => a == b,
    String.includes(result, "</body>"),
    true,
  )
  // Script should appear before </body>
  let scriptPos = String.indexOf(result, "<script>")
  let bodyPos = String.indexOf(result, "</body>")
  assertion(~message="script before </body>", ~operator="=", (a, b) => a < b, scriptPos, bodyPos)
  // Count occurrences of <script> — should be exactly 1
  let parts = String.split(result, "<script>")
  let count = Array.length(parts) - 1
  assertion(~message="exactly one script tag", ~operator="=", (a, b) => a == b, count, 1)
})

test("injectLiveReloadScript: inserts before </html> when no </body>", () => {
  let html = "<html><head></head><p>Hello</p></html>"
  let result = Injector.injectLiveReloadScript(~html, ~port=5173)
  // Should contain the script before </html>
  assertion(
    ~message="contains </html>",
    ~operator="=",
    (a, b) => a == b,
    String.includes(result, "</html>"),
    true,
  )
  // Script should appear before </html>
  let scriptPos = String.indexOf(result, "<script>")
  let htmlEndPos = String.indexOf(result, "</html>")
  assertion(~message="script before </html>", ~operator="=", (a, b) => a < b, scriptPos, htmlEndPos)
})

test("injectLiveReloadScript: appends when neither </body> nor </html>", () => {
  let html = "<p>Hello</p>"
  let result = Injector.injectLiveReloadScript(~html, ~port=5173)
  // Should contain the original content
  assertion(
    ~message="contains original p tag",
    ~operator="=",
    (a, b) => a == b,
    String.includes(result, "<p>Hello</p>"),
    true,
  )
  // Script should appear at or after the end of the original HTML content
  let pEnd = String.indexOf(result, "</p>") + 5 // after </p>
  let scriptPos = String.indexOf(result, "<script>")
  assertion(
    ~message="script at or after original content",
    ~operator="=",
    (a, b) => a >= b,
    scriptPos,
    pEnd,
  )
})

test("injectLiveReloadScript: does single replacement only", () => {
  let html = "<html><body><p>Hello</p></body><body><p>Another</p></body></html>"
  let result = Injector.injectLiveReloadScript(~html, ~port=5173)
  // Count occurrences of </body> using split
  let parts = String.split(result, "</body>")
  let count = Array.length(parts) - 1
  // Should have exactly 2 </body> (replace only replaces first occurrence)
  assertion(~message="exactly 2 body tags", ~operator="=", (a, b) => a == b, count, 2)
})
