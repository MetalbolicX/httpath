// Node/Buffer — public interface

type t

let fromString: (string, string) => t
let fromArray: array<int> => t
let concat: array<t> => t
let length: t => int
let readUInt8: (t, int) => int
