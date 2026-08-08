// Utils/Headers — generic HTTP header-array lookup helpers.
// Distinct from Security/Headers.res (which owns the eight security-header constants).

let getContentLength = (headers: array<(string, string)>): option<int> => {
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
  find(0)
}

let get = (headers: array<(string, string)>, name: string): option<string> => {
  let rec find = (i: int): option<string> => {
    if i >= Array.length(headers) {
      None
    } else {
      switch headers[i] {
      | Some((k, v)) if k == name => Some(v)
      | _ => find(i + 1)
      }
    }
  }
  find(0)
}

let getUpgradeHeader = (headers: array<(string, string)>): option<string> => {
  let rec find = (i: int): option<string> => {
    if i >= Array.length(headers) {
      None
    } else {
      switch headers[i] {
      | Some(("upgrade", v)) => Some(v)
      | _ => find(i + 1)
      }
    }
  }
  find(0)
}
