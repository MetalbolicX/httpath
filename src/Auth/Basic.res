// Auth/Basic.res — scrypt-based HTTP Basic Auth parser and verifier.
// .httpath-auth format: <username>:<params>$<salt-base64>$<hash-base64>
// Params are explicit: N=16384,r=8,p=1 (Node.js scrypt defaults).
// Only scrypt hashes are accepted; bcrypt/MD5/SHA1 are rejected.

// scryptSync via relative path to Scrypt.mjs helper
type scryptOpts = {n: int, r: int, p: int}
@module("../Node/Scrypt.mjs")
external scryptSyncFromHelper: (string, string, int, scryptOpts) => Buffer.t = "scryptSync"

// ---------------------------------------------------------------------------
// Types — scrypt params use lowercase n/r/p internally (ReScript restriction).
// The .httpath-auth file format uses N=16384,r=8,p=1 (capital N in file).
// ---------------------------------------------------------------------------

type scryptParams = {
  n: int,
  r: int,
  p: int,
}

type entry = {
  username: string,
  saltBase64: string,
  hashBase64: string,
  params: scryptParams,
}

type t = unit // opaque auth state placeholder

exception InvalidAuthFile(string)

// ---------------------------------------------------------------------------
// node:crypto externals
// ---------------------------------------------------------------------------

@module("node:crypto")
external timingSafeEqual: (Buffer.t, Buffer.t) => bool = "timingSafeEqual"

// ---------------------------------------------------------------------------
// ScryptParams helpers — file format uses uppercase N, lowercase internal
// ---------------------------------------------------------------------------

let _defaultScryptParams: scryptParams = {n: 16384, r: 8, p: 1}

let parseScryptParams = (s: string): option<scryptParams> => {
  // Expected format: "N=16384,r=8,p=1"
  let parts = String.split(s, ",")
  if Array.length(parts) != 3 {
    None
  } else {
    let getVal = (prefix: string, s: string): option<int> => {
      if String.length(s) <= String.length(prefix) || Js.String.substring(s, ~from=0, ~to_=String.length(prefix)) != prefix {
        None
      } else {
        let rest = Js.String.substring(s, ~from=String.length(prefix), ~to_=String.length(s))
        switch Belt.Int.fromString(rest) {
        | Some(v) => Some(v)
        | None => None
        }
      }
    }
    switch (
      getVal("N=", Array.get(parts, 0)->Belt.Option.getWithDefault("")),
      getVal("r=", Array.get(parts, 1)->Belt.Option.getWithDefault("")),
      getVal("p=", Array.get(parts, 2)->Belt.Option.getWithDefault("")),
    ) {
    | (Some(n), Some(r), Some(p)) =>
      if n < 1 || r < 1 || p < 1 {
        None // scrypt requires N, r, p >= 1
      } else {
        Some({n: n, r: r, p: p})
      }
    | _ => None
    }
  }
}

// ---------------------------------------------------------------------------
// parseAuthFile — parse .httpath-auth file content into entry array.
// ---------------------------------------------------------------------------

let parseAuthFile = (content: string): result<array<entry>, string> => {
  let lines = String.split(content, "\n")
  let entries = ref(list{})
  let rec process = (lines: array<string>): unit => {
    let n = Array.length(lines)
    if n == 0 {
      ()
    } else {
      let line = Array.get(lines, 0)->Belt.Option.getWithDefault("")
      let rest = Array.slice(lines, ~start=1, ~end=n)
      // Skip blank lines and # comment lines
      if line == "" || String.length(line) == 0 || Js.String.substring(line, ~from=0, ~to_=1) == "#" {
        process(rest)
      } else {
        // Expected format: username:params$salt$hash
        let colonPos = Js.String.indexOf(":", line)
        if colonPos < 0 {
          throw(InvalidAuthFile("Missing colon in line: " ++ line))
        } else {
          let username = String.substring(line, ~start=0, ~end=colonPos)
          let afterColon = String.substring(line, ~start=colonPos + 1, ~end=String.length(line))
          let dollarPos = Js.String.indexOf("$", afterColon)
          if dollarPos < 0 {
            throw(InvalidAuthFile("Missing $ in hash spec for user: " ++ username))
          } else {
            let paramsStr = String.substring(afterColon, ~start=0, ~end=dollarPos)
            let afterDollar = String.substring(afterColon, ~start=dollarPos + 1, ~end=String.length(afterColon))
            let dollar2Pos = Js.String.indexOf("$", afterDollar)
            if dollar2Pos < 0 {
              throw(InvalidAuthFile("Missing second $ in hash spec for user: " ++ username))
            } else {
              let saltB64 = String.substring(afterDollar, ~start=0, ~end=dollar2Pos)
              let hashB64 = String.substring(afterDollar, ~start=dollar2Pos + 1, ~end=String.length(afterDollar))
              let params = switch parseScryptParams(paramsStr) {
              | Some(p) => p
              | None =>
                throw(InvalidAuthFile("Invalid scrypt params for user " ++ username ++ ": " ++ paramsStr))
              }
              // Reject bcrypt and MD5 prefixes
              let firstChar = Js.String.substring(paramsStr, ~from=0, ~to_=1)
              if firstChar == "$" && (Js.String.substring(paramsStr, ~from=1, ~to_=2) == "2" || Js.String.substring(paramsStr, ~from=1, ~to_=2) == "$" && Js.String.substring(paramsStr, ~from=2, ~to_=3) == "a") {
                throw(InvalidAuthFile("Hash scheme not supported for user: " ++ username ++ " (bcrypt/MD5 not allowed)"))
              } else {
                ()
              }
              entries := list{({username: username, saltBase64: saltB64, hashBase64: hashB64, params: params}), ...entries.contents}
              process(rest)
            }
          }
        }
      }
    }
  }
  try {
    process(lines)
    Ok(Belt.List.toArray(List.reverse(entries.contents)))
  } catch {
  | InvalidAuthFile(msg) => Error(msg)
  | e =>
    let msg = switch JsExn.message(Obj.magic(e)) {
    | Some(m) => m
    | None => "unknown error"
    }
    Error(msg)
  }
}

// ---------------------------------------------------------------------------
// verify — check password against stored entry using scrypt.
// ---------------------------------------------------------------------------

let verify = (entry: entry, password: string): bool => {
  let _paramsStr = "N=" ++ Int.toString(entry.params.n) ++ ",r=" ++ Int.toString(entry.params.r) ++ ",p=" ++ Int.toString(entry.params.p)
  let hash = scryptSyncFromHelper(password, entry.saltBase64, 64, (entry.params :> scryptOpts))
  let storedBuf = Buffer.fromString(entry.hashBase64, "base64")
  // Length check before timing-safe compare to avoid short-circuit on length mismatch
  if Buffer.length(hash) != Buffer.length(storedBuf) {
    false
  } else {
    timingSafeEqual(hash, storedBuf)
  }
}

// ---------------------------------------------------------------------------
// findUser — linear search by username
// ---------------------------------------------------------------------------

let findUser = (entries: array<entry>, username: string): option<entry> => {
  let rec loop = (i: int): option<entry> => {
    if i >= Array.length(entries) {
      None
    } else {
      switch Array.get(entries, i) {
      | None => None
      | Some(e) =>
        if e.username == username {
          Some(e)
        } else {
          loop(i + 1)
        }
      }
    }
  }
  loop(0)
}

// ---------------------------------------------------------------------------
// loadAuthFile — read file and parse
// ---------------------------------------------------------------------------

let loadAuthFile = (path: string): result<array<entry>, string> => {
  let content = Fs.readFileSync(path, "utf-8")
  parseAuthFile(content)
}

// ---------------------------------------------------------------------------
// extractCredentials — parse Basic auth header, find user, verify password.
// Returns Some(username) on success, None on failure/missing.
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// searchAuthFile — search explicit path first, then fall back to directory search.
// Search order: explicitPath → <directory>/.httpath-auth → ~/.config/httpath/auth
// ---------------------------------------------------------------------------

let searchAuthFile = (~explicitPath: option<string>, ~directory: string): option<array<entry>> => {
  let homePath = Node_Path.join(Node_Path.join(Node_Path.join(Node_Os.homedir(), ".config"), "httpath"), "auth")
  let cwdPath = Node_Path.join(directory, ".httpath-auth")
  let tryPath = (p: string): option<array<entry>> => {
    try {
      switch loadAuthFile(p) {
      | Ok(entries) => Some(entries)
      | Error(_) => None
      }
    } catch {
    | _ => None
    }
  }
  let paths = switch explicitPath {
  | Some(p) => [p, cwdPath, homePath]
  | None => [cwdPath, homePath]
  }
  Belt.Array.reduce(paths, None, (acc, p) =>
    switch acc {
    | Some(_) => acc
    | None => tryPath(p)
    }
  )
}
