// Node/Buffer — strict-typed external for node:buffer.
// Uses BufferImpl.mjs shim to avoid ReScript ESM bracket-notation issue
// with node:buffer's namespaced Buffer.from / Buffer.concat exports.

type t

@module("./BufferImpl.mjs")
external fromString: (string, string) => t = "fromString"

@module("./BufferImpl.mjs")
external fromArray: array<int> => t = "fromArray"

@module("./BufferImpl.mjs")
external concat: array<t> => t = "concat"

@get external length: t => int = "length"

@send external readUInt8: (t, int) => int = "readUInt8"
