// Node/Http — public interface

type server
type incomingMessage
type serverResponse
type serverSocket
type upgradeHead

type handlerCb = Types.request => promise<Types.outcome>
type upgradeCb = (Types.request, serverSocket, Nullable.t<upgradeHead>) => promise<unit>

let socketWrite: (serverSocket, string) => unit
let socketWriteBuffer: (serverSocket, Buffer.t) => promise<result<unit, JsExn.t>>
let socketDestroy: serverSocket => unit
let closeServer: server => promise<unit>

type serverHandle = {
  server: server,
  closed: promise<unit>,
}

let startServer: (
  ~port: int,
  ~hostname: string,
  ~handler: handlerCb,
  ~onWsUpgrade: upgradeCb,
  ~signal: Signals.abortSignal,
) => serverHandle
