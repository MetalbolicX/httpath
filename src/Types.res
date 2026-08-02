// Types.res — shared types for the watcher module.

type fsEvent =
  | Modified(string)
  | Accessed(string)
  | Other

// HTTP request type — built in Http.res from IncomingMessage
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

// ---------------------------------------------------------------------------
// Live-reload constants (used by Injector)
// ---------------------------------------------------------------------------

let liveReloadEndpoint = "/livereload"
let liveReloadMessage = "reload"
