// Node_Process.res — strict-typed bindings for node:process.env.
// Pattern matches Node_Os.res / Node_Path.res: @val externals at module scope,
// no %raw, no Object.magic.

@val external processEnv: Dict.t<string> = "process.env"

/// Read an env var. Returns None when unset OR set to empty string.
let get = (name: string): option<string> =>
  switch Dict.get(processEnv, name) {
  | None => None
  | Some(v) => v == "" ? None : Some(v)
  }

/// Read an env var as int. Unset → default. Unparseable → warn + default.
let getInt = (~name: string, ~default: int): int =>
  switch get(name) {
  | None => default
  | Some(raw) =>
    switch Int.fromString(raw) {
    | Some(n) => n
    | None => {
        Console.error(
          `Warning: ${name}="${raw}" is not a valid integer; using default ${Int.toString(default)}`,
        )
        default
      }
    }
  }
