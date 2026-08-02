// mime_test.res — unit tests for Server/Mime per REQ-MIME-1..3.

open Test

// ---------------------------------------------------------------------------
// REQ-MIME-2: fixed table entries
// ---------------------------------------------------------------------------

test("Mime.mimeFor('html') returns text/html, isText=true", () => {
  let m = Mime.mimeFor(~ext="html")
  assertion(~message="contentType is text/html", ~operator="=",
    (a, b) => a == b, m.contentType, "text/html")
  assertion(~message="isText is true", ~operator="=",
    (a, b) => a == b, m.isText, true)
})

test("Mime.mimeFor('htm') returns text/html, isText=true", () => {
  let m = Mime.mimeFor(~ext="htm")
  assertion(~message="contentType is text/html", ~operator="=",
    (a, b) => a == b, m.contentType, "text/html")
  assertion(~message="isText is true", ~operator="=",
    (a, b) => a == b, m.isText, true)
})

test("Mime.mimeFor('css') returns text/css, isText=true", () => {
  let m = Mime.mimeFor(~ext="css")
  assertion(~message="contentType is text/css", ~operator="=",
    (a, b) => a == b, m.contentType, "text/css")
  assertion(~message="isText is true", ~operator="=",
    (a, b) => a == b, m.isText, true)
})

test("Mime.mimeFor('js') returns text/javascript", () => {
  let m = Mime.mimeFor(~ext="js")
  assertion(~message="contentType is text/javascript", ~operator="=",
    (a, b) => a == b, m.contentType, "text/javascript")
  assertion(~message="isText is true", ~operator="=",
    (a, b) => a == b, m.isText, true)
})

test("Mime.mimeFor('mjs') returns text/javascript", () => {
  let m = Mime.mimeFor(~ext="mjs")
  assertion(~message="contentType is text/javascript", ~operator="=",
    (a, b) => a == b, m.contentType, "text/javascript")
  assertion(~message="isText is true", ~operator="=",
    (a, b) => a == b, m.isText, true)
})

test("Mime.mimeFor('json') returns application/json, isText=false", () => {
  let m = Mime.mimeFor(~ext="json")
  assertion(~message="contentType is application/json", ~operator="=",
    (a, b) => a == b, m.contentType, "application/json")
  assertion(~message="isText is false", ~operator="=",
    (a, b) => a == b, m.isText, false)
})

test("Mime.mimeFor('txt') returns text/plain, isText=true", () => {
  let m = Mime.mimeFor(~ext="txt")
  assertion(~message="contentType is text/plain", ~operator="=",
    (a, b) => a == b, m.contentType, "text/plain")
  assertion(~message="isText is true", ~operator="=",
    (a, b) => a == b, m.isText, true)
})

test("Mime.mimeFor('svg') returns image/svg+xml, isText=false", () => {
  let m = Mime.mimeFor(~ext="svg")
  assertion(~message="contentType is image/svg+xml", ~operator="=",
    (a, b) => a == b, m.contentType, "image/svg+xml")
  assertion(~message="isText is false", ~operator="=",
    (a, b) => a == b, m.isText, false)
})

test("Mime.mimeFor('png') returns image/png", () => {
  let m = Mime.mimeFor(~ext="png")
  assertion(~message="contentType is image/png", ~operator="=",
    (a, b) => a == b, m.contentType, "image/png")
  assertion(~message="isText is false", ~operator="=",
    (a, b) => a == b, m.isText, false)
})

test("Mime.mimeFor('jpg') returns image/jpeg", () => {
  let m = Mime.mimeFor(~ext="jpg")
  assertion(~message="contentType is image/jpeg", ~operator="=",
    (a, b) => a == b, m.contentType, "image/jpeg")
  assertion(~message="isText is false", ~operator="=",
    (a, b) => a == b, m.isText, false)
})

test("Mime.mimeFor('jpeg') returns image/jpeg", () => {
  let m = Mime.mimeFor(~ext="jpeg")
  assertion(~message="contentType is image/jpeg", ~operator="=",
    (a, b) => a == b, m.contentType, "image/jpeg")
  assertion(~message="isText is false", ~operator="=",
    (a, b) => a == b, m.isText, false)
})

test("Mime.mimeFor('gif') returns image/gif", () => {
  let m = Mime.mimeFor(~ext="gif")
  assertion(~message="contentType is image/gif", ~operator="=",
    (a, b) => a == b, m.contentType, "image/gif")
  assertion(~message="isText is false", ~operator="=",
    (a, b) => a == b, m.isText, false)
})

test("Mime.mimeFor('webp') returns image/webp", () => {
  let m = Mime.mimeFor(~ext="webp")
  assertion(~message="contentType is image/webp", ~operator="=",
    (a, b) => a == b, m.contentType, "image/webp")
  assertion(~message="isText is false", ~operator="=",
    (a, b) => a == b, m.isText, false)
})

test("Mime.mimeFor('ico') returns image/x-icon", () => {
  let m = Mime.mimeFor(~ext="ico")
  assertion(~message="contentType is image/x-icon", ~operator="=",
    (a, b) => a == b, m.contentType, "image/x-icon")
  assertion(~message="isText is false", ~operator="=",
    (a, b) => a == b, m.isText, false)
})

test("Mime.mimeFor('wasm') returns application/wasm", () => {
  let m = Mime.mimeFor(~ext="wasm")
  assertion(~message="contentType is application/wasm", ~operator="=",
    (a, b) => a == b, m.contentType, "application/wasm")
  assertion(~message="isText is false", ~operator="=",
    (a, b) => a == b, m.isText, false)
})

test("Mime.mimeFor('map') returns application/json", () => {
  let m = Mime.mimeFor(~ext="map")
  assertion(~message="contentType is application/json", ~operator="=",
    (a, b) => a == b, m.contentType, "application/json")
  assertion(~message="isText is false", ~operator="=",
    (a, b) => a == b, m.isText, false)
})

// ---------------------------------------------------------------------------
// REQ-MIME-2: unknown extension → application/octet-stream
// ---------------------------------------------------------------------------

test("Mime.mimeFor('unknown') returns application/octet-stream, isText=false", () => {
  let m = Mime.mimeFor(~ext="unknown")
  assertion(~message="contentType is application/octet-stream", ~operator="=",
    (a, b) => a == b, m.contentType, "application/octet-stream")
  assertion(~message="isText is false", ~operator="=",
    (a, b) => a == b, m.isText, false)
})

test("Mime.mimeFor('woff2') returns application/octet-stream (REQ-MIME-3 parity gap)", () => {
  let m = Mime.mimeFor(~ext="woff2")
  assertion(~message="woff2 is octet-stream (not in fixed table)", ~operator="=",
    (a, b) => a == b, m.contentType, "application/octet-stream")
  assertion(~message="isText is false", ~operator="=",
    (a, b) => a == b, m.isText, false)
})

// ---------------------------------------------------------------------------
// REQ-MIME-1: fromPath extracts extension from file path
// ---------------------------------------------------------------------------

test("Mime.fromPath('index.html') returns text/html, isText=true", () => {
  let m = Mime.fromPath(~path="index.html")
  assertion(~message="fromPath html", ~operator="=",
    (a, b) => a == b, m.contentType, "text/html")
  assertion(~message="isText is true", ~operator="=",
    (a, b) => a == b, m.isText, true)
})

test("Mime.fromPath('/foo/bar.css') returns text/css", () => {
  let m = Mime.fromPath(~path="/foo/bar.css")
  assertion(~message="fromPath css", ~operator="=",
    (a, b) => a == b, m.contentType, "text/css")
})

test("Mime.fromPath('file.MIME') is case-insensitive", () => {
  let m = Mime.fromPath(~path="file.MIME")
  assertion(~message="MIME is treated as mime", ~operator="=",
    (a, b) => a == b, m.contentType, "application/octet-stream")
  // MIME is not in the table, so it's unknown
})

test("Mime.fromPath('x.html') returns html", () => {
  let m = Mime.fromPath(~path="x.html")
  assertion(~message="fromPath strips path, gets html", ~operator="=",
    (a, b) => a == b, m.contentType, "text/html")
})

test("Mime.fromPath('noextension') returns octet-stream", () => {
  let m = Mime.fromPath(~path="noextension")
  assertion(~message="no extension is octet-stream", ~operator="=",
    (a, b) => a == b, m.contentType, "application/octet-stream")
})
