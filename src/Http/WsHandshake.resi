// Http/WsHandshake — public interface

let computeAccept: string => string
let handshakeResponse: (~requestId: string, string) => string
