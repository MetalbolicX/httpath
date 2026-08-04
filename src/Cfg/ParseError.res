// ParseError.res — typed CLI parse error variants.
// UnwritableAccessLog is an exception (raise-able); others are returned as result types.

type t =
  | UnknownFlag(string)
  | MissingValue(string)
  | InvalidPort(int)
  | InvalidLogLevel(string)
  | RemovedFlag(string)
  | InvalidPath(string)
  | HelpRequested
  | InvalidRateLimit(string, int)

// UnwritableAccessLog is a raise-able exception (separate from the result variant)
exception UnwritableAccessLog(string)

let toString = (e: t): string => {
  switch e {
  | UnknownFlag(flag) => `Unknown flag: ${flag}`
  | MissingValue(flag) => `Missing value for flag: ${flag}`
  | InvalidPort(port) => `Invalid port: ${Belt.Int.toString(port)}. Must be between 0 and 65535.`
  | InvalidLogLevel(level) => `Invalid log level: ${level}. Must be one of: info, debug, error.`
  | RemovedFlag(flag) => `Flag has been removed: ${flag}`
  | InvalidPath(path) => `Invalid path: ${path}`
  | HelpRequested => "Help requested"
  | InvalidRateLimit(kind, val) =>
    `Invalid rate limit ${kind}: ${Belt.Int.toString(val)}. Must be a positive integer.`
  }
}
