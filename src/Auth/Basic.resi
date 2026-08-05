// Auth/Basic.resi — scrypt Basic Auth interface.

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

type t

let parseAuthFile: string => result<array<entry>, string>
let verify: (entry, string) => bool
let findUser: (array<entry>, string) => option<entry>
let loadAuthFile: string => result<array<entry>, string>
let searchAuthFile: (~explicitPath: option<string>, ~directory: string) => option<array<entry>>
