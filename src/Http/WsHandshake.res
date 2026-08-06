// WsHandshake.res — RFC 6455 §4.1 server-side handshake helpers.

let computeAccept = (clientKey: string): string =>
  Crypto.sha1Base64(clientKey ++ "258EAFA5-E914-47DA-95CA-C5AB0DC85B11")

let handshakeResponse = (~requestId: string, accept: string): string =>
  "HTTP/1.1 101 Switching Protocols\r\n"
  ++ "Upgrade: websocket\r\n"
  ++ "Connection: Upgrade\r\n"
  ++ "Sec-WebSocket-Accept: "
  ++ accept
  ++ "\r\n"
  ++ "x-request-id: "
  ++ requestId
  ++ "\r\n\r\n"
