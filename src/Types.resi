// Types.resi — shared types for the watcher module.

type fsEvent =
  | Modified(string)
  | Accessed(string)
  | Other

type request = {
  method: string,
  path: string,
  headers: array<(string, string)>,
  clientIp: string,
}

type bodyContent =
  | File(string)
  | Html(string)
  | Empty

type response = {
  status: int,
  headers: array<(string, string)>,
  body: bodyContent,
}

type outcome =
  | Respond(response)
  | WsUpgrade

let liveReloadEndpoint: string
let liveReloadMessage: string
