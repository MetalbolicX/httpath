// Security/Origin — pure helpers for parsing the WebSocket Origin header.
// Extracted from Server/Handler so Gate.checkOrigin can stay pure and
// independently testable.

let extractOriginHost = (origin: string): option<string> => {
  let parts = Js.String.split("://", origin)
  if Array.length(parts) >= 2 {
    let rest = Belt.Array.getUnsafe(parts, 1)
    let hostParts = Js.String.split("/", rest)
    let host = Belt.Array.getUnsafe(hostParts, 0)
    Some(host)
  } else {
    None
  }
}
