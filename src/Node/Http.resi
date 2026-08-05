// Node/Http — public interface

type server
type httpsServer
type incomingMessage
type serverResponse
type serverSocket
type upgradeHead

// serverVariant — allows Httpath to call the right _close for HTTP vs HTTPS.
type serverVariant =
  | HttpServer(server)
  | HttpsServer(httpsServer)

type handlerCb = Types.request => promise<Types.outcome>
type upgradeCb = (Types.request, serverSocket, Nullable.t<upgradeHead>) => promise<unit>

let socketWrite: (serverSocket, string) => unit
let socketWriteBuffer: (serverSocket, Buffer.t) => promise<result<unit, JsExn.t>>
let socketDestroy: serverSocket => unit
let closeServer: server => promise<unit>
let closeServerVariant: serverVariant => promise<unit>
let resolveClientIp: (~trustProxy: bool, ~socketIp: string, ~headers: array<(string, string)>) => string
let extractCredentials: (~authHeader: option<string>, ~entries: array<Basic.entry>) => option<string>

type serverHandle = {
  server: serverVariant,
  closed: promise<unit>,
  listening: promise<unit>,
}

let startServer: (
  ~port: int,
  ~hostname: string,
  ~handler: handlerCb,
  ~onWsUpgrade: upgradeCb,
  ~signal: Signals.abortSignal,
  ~trustProxy: bool,
  ~accessLog: option<string>,
  ~config: Config.t,
  ~rateLimiter: option<RateLimit.t>,
  ~authEntries: option<array<Basic.entry>>,
  ~tlsCertKey: option<Tls.certKeyPair>,
) => serverHandle
