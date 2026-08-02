// Fs.res — Node.js fs bindings (promise-based for static-file handler).
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

// ---------------------------------------------------------------------------
// Re-export existing stream API (unchanged)
// ---------------------------------------------------------------------------

@bs.scope("fs")
@bs.val
external createReadStream: string => readStream = "createReadStream"

@send
external pipeStream: (readStream, 'a) => 'a = "pipe"

// ---------------------------------------------------------------------------
// Synchronous bindings for unit testing (fs without /promises)
// ---------------------------------------------------------------------------

@bs.scope("fs") @bs.val
external readFileSync: string => string = "readFileSync"

@bs.scope("fs") @bs.val
external lstatSync: string => stats = "lstatSync"

@bs.scope("fs") @bs.val
external statSync: string => stats = "statSync"

@bs.scope("fs") @bs.val
external readdirSync: (string) => array<dirent> = "readdirSync"

@bs.scope("fs") @bs.val
external mkdirSync: string => unit = "mkdirSync"

@bs.scope("fs") @bs.val
external rmdirSync: string => unit = "rmdirSync"

@bs.scope("fs") @bs.val
external symlinkSync: (string, string) => unit = "symlinkSync"

@bs.scope("fs") @bs.val
external unlinkSync: string => unit = "unlinkSync"

@bs.scope("fs") @bs.val
external writeFileSync: (string, string) => unit = "writeFileSync"

// ---------------------------------------------------------------------------
// Promise-based bindings using node:fs/promises
// ---------------------------------------------------------------------------

type readdirOptions = { withFileTypes: bool }

@module("node:fs/promises")
external _readdir: (string, readdirOptions) => promise<array<dirent>> = "readdir"

let readdir = (path: string): promise<array<dirent>> => {
  _readdir(path, { withFileTypes: true })
}

@module("node:fs/promises")
external lstat: string => promise<stats> = "lstat"

@module("node:fs/promises")
external stat: string => promise<stats> = "stat"

@module("node:fs/promises")
external readTextFile: string => promise<string> = "readTextFile"
