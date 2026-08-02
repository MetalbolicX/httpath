// ParseError.res — typed CLI parse error variants.

type t =
  | UnknownFlag(string)
  | MissingValue(string)
  | InvalidPort(int)
  | InvalidLogLevel(string)
  | RemovedFlag(string)
  | InvalidPath(string)
  | HelpRequested

let toString = (e: t): string => {
  switch e {
  | UnknownFlag(flag) => `Unknown flag: ${flag}`
  | MissingValue(flag) => `Missing value for flag: ${flag}`
  | InvalidPort(port) => `Invalid port: ${Belt.Int.toString(port)}. Must be between 0 and 65535.`
  | InvalidLogLevel(level) => `Invalid log level: ${level}. Must be one of: info, debug, error.`
  | RemovedFlag(flag) => `Flag has been removed: ${flag}`
  | InvalidPath(path) => `Invalid path: ${path}`
  | HelpRequested => "Help requested"
  }
}
