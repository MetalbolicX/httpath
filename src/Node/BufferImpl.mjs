// BufferImpl — plain-JS shim for node:buffer APIs that need dot-notation access.
// ReScript @module generates bracket-notation for namespaced APIs; this file
// re-exports the same functions with direct dot-notation access.

import * as Nodebuffer from "node:buffer";

export const fromString = Nodebuffer.Buffer.from.bind(Nodebuffer.Buffer);
export const fromArray = Nodebuffer.Buffer.from.bind(Nodebuffer.Buffer);
export const concat = Nodebuffer.Buffer.concat.bind(Nodebuffer.Buffer);
export const Buffer = Nodebuffer.Buffer;
export const toString = (buf, encoding) => buf.toString(encoding);
