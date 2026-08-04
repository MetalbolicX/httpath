// src/Server/AccessLog.res — structured access log emitter.
// Emits one line per request: ISO8601 | ip | method | path | status | bytes
// Under --lan, defaults to stdout; --access-log <path> appends to a file.
// CR/LF in path are sanitized. File writability is validated at config-load time.

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
type record = {
  timestamp: string,
  ip: string,
  method: string,
  path: string,
  status: int,
  bytes: int,
}

// format — pure formatter, CR/LF sanitized
// Uses String.replace for plain-string replacement (no regex needed for single chars)
let format = (entry: record): string => {
  let sanitizedPath = entry.path
    ->String.replace("\r", "?")
    ->String.replace("\n", "?")
  `${entry.timestamp} | ${entry.ip} | ${entry.method} | ${sanitizedPath} | ${Belt.Int.toString(entry.status)} | ${Belt.Int.toString(entry.bytes)}`
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
    raise(ParseError.UnwritableAccessLog(path))
  }
}
