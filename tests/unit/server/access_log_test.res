// tests/unit/server/access_log_test.res — unit tests for AccessLog module.
// Strict TDD: RED tests written first, referencing src/Server/AccessLog.res
// which does not exist yet.

open Test

// AccessLog.record is the log entry type — defined in src/Server/AccessLog.res
type logEntry = AccessLog.record

// ---------------------------------------------------------------------------
// Test helpers — module-level externals for temp file handling
// ---------------------------------------------------------------------------

@module("node:os") external tmpdir: unit => string = "tmpdir"
@module("node:path") external join: (string, string) => string = "join"
@module("node:fs") external writeFileSync: (string, string) => unit = "writeFileSync"
@module("node:fs") external unlinkSync: string => unit = "unlinkSync"

// ---------------------------------------------------------------------------
// AccessLog.format — pure formatter
// ---------------------------------------------------------------------------

test("AccessLog.format produces ISO8601 | ip | method | path | status | bytes", () => {
  let ts = "2026-08-04T07:44:10.000Z"
  let entry: logEntry = {
    timestamp: ts,
    ip: "192.168.1.42",
    method: "GET",
    path: "/index.html",
    status: 200,
    bytes: 1024,
  }
  let line = AccessLog.format(entry)
  assertion(
    ~message="format produces correct pipe-delimited line",
    ~operator="=",
    (a, b) => a == b,
    line,
    "2026-08-04T07:44:10.000Z | 192.168.1.42 | GET | /index.html | 200 | 1024",
  )
})

test("AccessLog.format sanitizes CR in path", () => {
  let entry: logEntry = {
    timestamp: "2026-08-04T07:44:10.000Z",
    ip: "192.168.1.1",
    method: "GET",
    path: "/foo\rbar",
    status: 200,
    bytes: 0,
  }
  let line = AccessLog.format(entry)
  // Should not contain raw CR
  assertion(
    ~message="line does not contain raw CR",
    ~operator="=",
    (a, b) => a == b,
    String.includes(line, "\r"),
    false,
  )
})

test("AccessLog.format sanitizes LF in path", () => {
  let entry: logEntry = {
    timestamp: "2026-08-04T07:44:10.000Z",
    ip: "192.168.1.1",
    method: "POST",
    path: "/foo\nbar",
    status: 200,
    bytes: 0,
  }
  let line = AccessLog.format(entry)
  // Should not contain raw LF
  assertion(
    ~message="line does not contain raw LF",
    ~operator="=",
    (a, b) => a == b,
    String.includes(line, "\n"),
    false,
  )
})

test("AccessLog.format sanitizes CRLF in path (no raw CR or LF)", () => {
  let entry: logEntry = {
    timestamp: "2026-08-04T07:44:10.000Z",
    ip: "192.168.1.1",
    method: "PUT",
    path: "/foo\r\nbar",
    status: 201,
    bytes: 512,
  }
  let line = AccessLog.format(entry)
  // Should not contain raw CR or LF
  assertion(
    ~message="line does not contain raw CR",
    ~operator="=",
    (a, b) => a == b,
    String.includes(line, "\r"),
    false,
  )
  assertion(
    ~message="line does not contain raw LF",
    ~operator="=",
    (a, b) => a == b,
    String.includes(line, "\n"),
    false,
  )
})

test("AccessLog.format with 0 bytes shows 0 not empty", () => {
  let entry: logEntry = {
    timestamp: "2026-08-04T07:44:10.000Z",
    ip: "127.0.0.1",
    method: "HEAD",
    path: "/",
    status: 200,
    bytes: 0,
  }
  let line = AccessLog.format(entry)
  // Last field should be 0
  assertion(
    ~message="line ends with 0 for empty body",
    ~operator="=",
    (a, b) => a == b,
    String.endsWith(line, " | 0"),
    true,
  )
})

// ---------------------------------------------------------------------------
// AccessLog.validateFile — file writability check at config-load time
// ---------------------------------------------------------------------------

test("AccessLog.validateFile accepts a writable temp file", () => {
  let tmp = join(tmpdir(), "httpath.alog.test.")
  let path = tmp ++ "valid"
  try {
    writeFileSync(path, "")
    let result = AccessLog.validateFile(path)
    assertion(
      ~message="validateFile returns unit for writable path",
      ~operator="=",
      (a, b) => a == b,
      result,
      (),
    )
    unlinkSync(path)
  } catch {
  | e =>
    try {unlinkSync(path)} catch { | _ => () }
    JsError.throwWithMessage("validateFile threw on writable file: " ++ Belt.Option.getWithDefault(JsExn.message(Obj.magic(e)), "unknown"))
  }
})

test("AccessLog.validateFile throws for unwritable path", () => {
  let result = try {
    AccessLog.validateFile("/nonexistent-dir/httpath.log")
    Ok()
  } catch {
  | e =>
    Error(Belt.Option.getWithDefault(JsExn.message(Obj.magic(e)), "unknown"))
  }
  switch result {
  | Ok() => JsError.throwWithMessage("validateFile should have thrown for unwritable path")
  | Error(_) => () // expected — any error means validation works
  }
})
