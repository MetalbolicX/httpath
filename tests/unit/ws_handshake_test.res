// ws_handshake_test.res — RFC 6455 §4 handshake vector test.

open Test

// RFC 6455 §1.3 example
test("WsHandshake.computeAccept matches RFC 6455 §1.3 test vector", () => {
  let clientKey = "dGhlIHNhbXBsZSBub25jZQ=="
  let expected = "s3pPLMBiTxaQ9kYGzzhZRbK+xOo="
  assertion(
    ~message="computeAccept matches RFC 6455 §1.3 example",
    ~operator="=",
    (a, b) => a == b,
    WsHandshake.computeAccept(clientKey),
    expected,
  )
})

test("WsHandshake.handshakeResponse starts with HTTP/1.1 101", () => {
  let response = WsHandshake.handshakeResponse("s3pPLMBiTxaQ9kYGzzhZRbK+xOo=")
  assertion(
    ~message="response starts with 'HTTP/1.1 101'",
    ~operator="=",
    (a, b) => a == b,
    Js.String.substring(response, ~from=0, ~to_=12),
    "HTTP/1.1 101",
  )
})

test("WsHandshake.handshakeResponse includes Sec-WebSocket-Accept", () => {
  let accept = "s3pPLMBiTxaQ9kYGzzhZRbK+xOo="
  let response = WsHandshake.handshakeResponse(accept)
  assertion(
    ~message="response contains the accept header value",
    ~operator="=",
    (a, b) => a == b,
    String.includes(response, "Sec-WebSocket-Accept: " ++ accept),
    true,
  )
})
