// src/Server/AccessLog.res — structured access log emitter.
// Emits one line per request: ISO8601 | ip | method | path | status | bytes
// Under --lan, defaults to stdout; --access-log <path> appends to a file.
// CR/LF in path are sanitized. File writability is validated at config-load time.
// JSON mode (default) emits one JSON object per line with ts, request_id,
// ip, method, path, status, bytes, and duration_ms.

// Synchronous fs bindings for config-time validation
@module("node:fs") external appendFileSync: (string, string) => unit = "appendFileSync"
@module("node:fs") external unlinkSync: string => unit = "unlinkSync"

// process.stdout for stdout destination
@module("process") external stdout: 'a = "stdout"
@send external stdoutWrite: ('a, string) => int = "write"

// Destination for log output
type dest =
  | Stdout
  | File(string)

// Log entry — all fields required
// Both plain and JSON formats use this unified type.
// Plain format appends request_id and duration_ms to the pipe-delimited line.
type record = {
  timestamp: string,
  requestId: string,
  ip: string,
  method: string,
  path: string,
  status: int,
  bytes: int,
  duration_ms: int,
}

// line is an alias for record (kept for source clarity at call sites)
type line = record

// format — pure formatter, CR/LF sanitized
// Uses String.replace for plain-string replacement (no regex needed for single chars)
let format = (entry: record): string => {
  let sanitizedPath = entry.path
    ->String.replace("\r", "?")
    ->String.replace("\n", "?")
  `${entry.timestamp} | ${entry.ip} | ${entry.method} | ${sanitizedPath} | ${Belt.Int.toString(entry.status)} | ${Belt.Int.toString(entry.bytes)} | ${entry.requestId} | ${Belt.Int.toString(entry.duration_ms)}`
}

// formatJson — pure JSON formatter, CR/LF sanitized.
// Returns one-line JSON string with the required fields.
// Hand-rolled to avoid Js.Json / JSON.Encode deprecation churn.
// Field set matches SCN-SL-001 / REQ-AL-002 in spec #3111.
let formatJson = (entry: line): string => {
  let sanitizedPath = entry.path
    ->String.replace("\r", "?")
    ->String.replace("\n", "?")
  // All string fields are assumed safe (caller controls them); CR/LF stripped from path.
  `{"ts":"${entry.timestamp}","request_id":"${entry.requestId}","ip":"${entry.ip}","method":"${entry.method}","path":"${sanitizedPath}","status":${Int.toString(entry.status)},"bytes":${Int.toString(entry.bytes)},"duration_ms":${Int.toString(entry.duration_ms)}}`
}

// writeLine — emit one line to the destination
let writeLine = (dest: dest, line: string): unit => {
  let withNewline = line ++ "\n"
  switch dest {
  | Stdout => {
      let _ = stdoutWrite(stdout, withNewline)
      ()
    }
  | File(path) => appendFileSync(path, withNewline)
  }
}

// emit — branch on Logger.getMode() and emit the appropriate format.
// This is the main entry point for AccessLog from Http.res once wired.
let emit = (dest: dest, entry: line): unit => {
  let line = switch Logger.getMode() {
  | Logger.Plain => format(entry)
  | Logger.Json => formatJson(entry)
  }
  writeLine(dest, line)
}

// validateFile — check writability at config-load time
// Creates the file if it doesn't exist, then checks it can be opened for write.
// Throws ParseError.UnwritableAccessLog on failure.
let validateFile = (path: string): unit => {
  try {
    // Try appending an empty write — this fails if dir doesn't exist or no write perms
    appendFileSync(path, "")
    // Clean up the empty file we just created
    unlinkSync(path)
  } catch {
  | _ =>
    throw(ParseError.UnwritableAccessLog(path))
  }
}
