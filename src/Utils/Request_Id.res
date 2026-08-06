// src/Utils/Request_Id.res — request ID generation via crypto.randomUUID.
// Wraps node:crypto.randomUUID() for a fresh UUIDv4 per request.

@val @scope("crypto") external randomUUID: unit => string = "randomUUID"

let make = (): string => randomUUID()
