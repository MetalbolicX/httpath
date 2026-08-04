// Crypto.res — node:crypto bindings (SHA1+base64 for WebSocket handshake).

type hash

@module("node:crypto")
external createHash: string => hash = "createHash"

@send external hashUpdate: (hash, string) => unit = "update"

@send external hashDigest: (hash, string) => string = "digest"

let sha1Base64 = (input: string): string => {
  let h = createHash("sha1")
  hashUpdate(h, input)
  hashDigest(h, "base64")
}
