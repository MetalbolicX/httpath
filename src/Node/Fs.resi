// Fs.resi — Node.js fs bindings (promise-based for static-file handler).
// Extended per REQ-INT-3: readdir, lstat, stat, readTextFile.

type readStream

// dirent — returned by readdir with withFileTypes: true
type dirent = {
  name: string,
  isDirectory: bool,
}

// stats — returned by stat / lstat
type stats = {
  isFile: bool,
  isDirectory: bool,
  isSymlink: bool,
}

// Accessor externals for Node.js Stats/Dirent method calls.
// Node.js Stats has isFile/isDirectory/isSymbolicLink as METHODS.
// These accessors use @send to call them properly.
// They also work on plain record mocks used in tests.
let statIsFile: stats => bool
let statIsDirectory: stats => bool
let statIsSymlink: stats => bool
let statSize: stats => int
let direntName: dirent => string
let direntIsDirectory: dirent => bool

// Re-export existing stream API (unchanged)
let createReadStream: string => readStream
let pipeStream: (readStream, 'a) => 'a

// Synchronous bindings for unit testing
let readFileSync: string => string
let lstatSync: string => stats
let statSync: string => stats
let readdirSync: string => array<dirent>
let mkdirSync: string => unit
let rmdirSync: string => unit
let symlinkSync: (string, string) => unit
let unlinkSync: string => unit
let writeFileSync: (string, string) => unit

// Promise-based bindings using node:fs/promises
let readdir: string => promise<array<dirent>>
let lstat: string => promise<stats>
let stat: string => promise<stats>
let readTextFile: string => promise<string>
