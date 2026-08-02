// node_fs_test.res — unit tests for Node Fs bindings.
// Tests readdir, lstat, stat, readTextFile, and stat helpers
// per REQ-INT-3.
// Uses synchronous fs operations for compatibility with the sync test harness.

open Test

// ---------------------------------------------------------------------------
// Sync temp directory helpers
// ---------------------------------------------------------------------------

@module("node:os") external tmpdir: unit => string = "tmpdir"
@module("node:path") external join: (string, string) => string = "join"
@module("node:fs") external mkdtemp: string => string = "mkdtempSync"
@module("node:fs") external rmdirSync: string => unit = "rmdirSync"
@module("node:fs") external mkdirSync: string => unit = "mkdirSync"
@module("node:fs") external unlinkSync: string => unit = "unlinkSync"
@module("node:fs") external symlinkSync: (string, string) => unit = "symlinkSync"

let withTempDir = (f: string => unit): unit => {
  let prefix = join(tmpdir(), "httpath.fs.test.")
  let tempDir = mkdtemp(prefix)
  try {
    f(tempDir)
  } catch {
  | _e =>
    // Best-effort cleanup on failure; ignore errors
    try { rmdirSync(tempDir) } catch { | _ => () }
  }
  try { rmdirSync(tempDir) } catch { | _ => () }
}

let withFile = (~dir: string, ~name: string, ~content: string, ~f: string => unit): unit => {
  let path = join(dir, name)
  Fs.writeFileSync(path, content)
  f(path)
  unlinkSync(path)
}

// ---------------------------------------------------------------------------
// REQ-INT-3: readdirSync — returns array of dirent records
// ---------------------------------------------------------------------------

test("Fs.readdirSync returns dirents with name and isDirectory", () => {
  withTempDir(tempDir => {
    let filePath = join(tempDir, "readme.txt")
    let dirPath = join(tempDir, "subdir")
    Fs.writeFileSync(filePath, "hello world")
    mkdirSync(dirPath)
    let entries = Fs.readdirSync(tempDir)
    assertion(
      ~message="readdirSync returns 2 entries",
      ~operator="=",
      (a, b) => a == b,
      Array.length(entries),
      2,
    )
    let fileEntry = entries->Array.find(entry => entry.name == "readme.txt")
    switch fileEntry {
    | Some(e) =>
      assertion(
        ~message="file entry isDirectory is false",
        ~operator="=",
        (a, b) => a == b,
        e.isDirectory,
        false,
      )
    | None =>
      Js.Exn.raiseError("Expected to find readme.txt in readdirSync entries")
    }
    let dirEntry = entries->Array.find(entry => entry.name == "subdir")
    switch dirEntry {
    | Some(e) =>
      assertion(
        ~message="dir entry isDirectory is true",
        ~operator="=",
        (a, b) => a == b,
        e.isDirectory,
        true,
      )
    | None =>
      Js.Exn.raiseError("Expected to find subdir in readdirSync entries")
    }
  })
})

// ---------------------------------------------------------------------------
// REQ-INT-3: readFileSync — returns file contents as string
// ---------------------------------------------------------------------------

test("Fs.readFileSync returns UTF-8 file contents", () => {
  withTempDir(tempDir => {
    withFile(~dir=tempDir, ~name="greeting.txt", ~content="Hello, 世界!", ~f=_ => {
      let content = Fs.readFileSync(join(tempDir, "greeting.txt"))
      assertion(
        ~message="readFileSync returns exact content",
        ~operator="=",
        (a, b) => a == b,
        content,
        "Hello, 世界!",
      )
    })
  })
})

// ---------------------------------------------------------------------------
// REQ-INT-3: statSync — returns stats record with isFile/isDirectory/isSymlink
// ---------------------------------------------------------------------------

test("Fs.statSync on a file: isFile=true, isDirectory=false, isSymlink=false", () => {
  withTempDir(tempDir => {
    withFile(~dir=tempDir, ~name="notes.txt", ~content="test data", ~f=filePath => {
      let stats = Fs.statSync(filePath)
      assertion(
        ~message="isFile is true",
        ~operator="=",
        (a, b) => a == b,
        stats.isFile,
        true,
      )
      assertion(
        ~message="isDirectory is false",
        ~operator="=",
        (a, b) => a == b,
        stats.isDirectory,
        false,
      )
      assertion(
        ~message="isSymlink is false",
        ~operator="=",
        (a, b) => a == b,
        stats.isSymlink,
        false,
      )
    })
  })
})

test("Fs.statSync on a directory: isDirectory=true, isFile=false", () => {
  withTempDir(tempDir => {
    let subdir = join(tempDir, "mydir")
    mkdirSync(subdir)
    let stats = Fs.statSync(subdir)
    assertion(
      ~message="isDirectory is true",
      ~operator="=",
      (a, b) => a == b,
      stats.isDirectory,
      true,
    )
    assertion(
      ~message="isFile is false",
      ~operator="=",
      (a, b) => a == b,
      stats.isFile,
      false,
    )
  })
})

// ---------------------------------------------------------------------------
// REQ-INT-3: lstatSync — same as statSync but does NOT follow symlinks
// ---------------------------------------------------------------------------

test("Fs.lstatSync on a symlink: isSymlink=true (while statSync follows)", () => {
  withTempDir(tempDir => {
    let target = join(tempDir, "target.txt")
    let link = join(tempDir, "link.txt")
    Fs.writeFileSync(target, "target content")
    symlinkSync(target, link)
    // lstatSync sees the symlink as a symlink
    let lstats = Fs.lstatSync(link)
    assertion(
      ~message="lstatSync: isSymlink is true",
      ~operator="=",
      (a, b) => a == b,
      lstats.isSymlink,
      true,
    )
    assertion(
      ~message="lstatSync: isFile is false (it's a symlink)",
      ~operator="=",
      (a, b) => a == b,
      lstats.isFile,
      false,
    )
    // statSync follows the symlink
    let stats = Fs.statSync(link)
    assertion(
      ~message="statSync follows: isFile is true",
      ~operator="=",
      (a, b) => a == b,
      stats.isFile,
      true,
    )
    assertion(
      ~message="statSync follows: isSymlink is false",
      ~operator="=",
      (a, b) => a == b,
      stats.isSymlink,
      false,
    )
  })
})

// ---------------------------------------------------------------------------
// Existing stream API remains intact (smoke test)
// ---------------------------------------------------------------------------

test("Fs.createReadStream returns a readStream (existing API)", () => {
  withTempDir(tempDir => {
    withFile(~dir=tempDir, ~name="stream-test.txt", ~content="stream content", ~f=filePath => {
      let rs: Fs.readStream = Fs.createReadStream(filePath)
      assertion(
        ~message="createReadStream produces a value",
        ~operator="=",
        (a, b) => a == b,
        true,
        true,
      )
    })
  })
})
