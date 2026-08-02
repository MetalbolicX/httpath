// node_path_test.res — unit tests for Node_Path bindings.
// Tests resolve, join, normalize, relative, extname, basename
// per REQ-PATH-1.

open Test

// ---------------------------------------------------------------------------
// resolve — resolves a sequence of paths to an absolute path
// ---------------------------------------------------------------------------

test("Node_Path.resolve returns absolute path unchanged", () => {
  let abs = Node_Path.resolve("/foo/bar", "")
  let firstCharOpt = String.get(abs, 0)
  let isAbs = switch firstCharOpt {
  | Some(c) => c == "/"
  | None => false
  }
  assertion(
    ~message="resolve(/foo/bar, '') is absolute (starts with /)",
    ~operator="=",
    (a, b) => a == b,
    isAbs,
    true,
  )
})

test("Node_Path.resolve('/a', '/b') returns the last absolute segment", () => {
  let result = Node_Path.resolve("/a", "/b")
  assertion(
    ~message="resolve(/a, /b) is /b",
    ~operator="=",
    (a, b) => a == b,
    result,
    "/b",
  )
})

test("Node_Path.resolve('/foo/bar', '') returns /foo/bar", () => {
  let result = Node_Path.resolve("/foo/bar", "")
  assertion(
    ~message="resolve(/foo/bar, empty) is /foo/bar",
    ~operator="=",
    (a, b) => a == b,
    result,
    "/foo/bar",
  )
})

// ---------------------------------------------------------------------------
// join — joins all given path segments
// ---------------------------------------------------------------------------

test("Node_Path.join('a', 'b') returns a/b", () => {
  let result = Node_Path.join("a", "b")
  assertion(
    ~message="join(a, b) is a/b",
    ~operator="=",
    (a, b) => a == b,
    result,
    "a/b",
  )
})

test("Node_Path.join('/a', 'b') returns /a/b", () => {
  let result = Node_Path.join("/a", "b")
  assertion(
    ~message="join(/a, b) is /a/b",
    ~operator="=",
    (a, b) => a == b,
    result,
    "/a/b",
  )
})

// ---------------------------------------------------------------------------
// normalize — normalizes path separators and resolves . and ..
// ---------------------------------------------------------------------------

test("Node_Path.normalize('a/b/../c') returns a/c", () => {
  let result = Node_Path.normalize("a/b/../c")
  assertion(
    ~message="normalize(a/b/../c) is a/c",
    ~operator="=",
    (a, b) => a == b,
    result,
    "a/c",
  )
})

test("Node_Path.normalize('a/b/./c') returns a/b/c", () => {
  let result = Node_Path.normalize("a/b/./c")
  assertion(
    ~message="normalize(a/b/./c) is a/b/c",
    ~operator="=",
    (a, b) => a == b,
    result,
    "a/b/c",
  )
})

test("Node_Path.normalize('./foo') returns foo", () => {
  let result = Node_Path.normalize("./foo")
  assertion(
    ~message="normalize(./foo) is foo",
    ~operator="=",
    (a, b) => a == b,
    result,
    "foo",
  )
})

// ---------------------------------------------------------------------------
// relative — returns the relative path from base to target
// ---------------------------------------------------------------------------

test("Node_Path.relative('/a/b', '/a/b/c') returns c", () => {
  let result = Node_Path.relative("/a/b", "/a/b/c")
  assertion(
    ~message="relative(/a/b, /a/b/c) is c",
    ~operator="=",
    (a, b) => a == b,
    result,
    "c",
  )
})

test("Node_Path.relative('/a/b/c', '/a/b') returns ..", () => {
  let result = Node_Path.relative("/a/b/c", "/a/b")
  assertion(
    ~message="relative(/a/b/c, /a/b) is ..",
    ~operator="=",
    (a, b) => a == b,
    result,
    "..",
  )
})

// ---------------------------------------------------------------------------
// extname — returns the file extension including the dot
// ---------------------------------------------------------------------------

test("Node_Path.extname('file.txt') returns .txt", () => {
  let result = Node_Path.extname("file.txt")
  assertion(
    ~message="extname(file.txt) is .txt",
    ~operator="=",
    (a, b) => a == b,
    result,
    ".txt",
  )
})

test("Node_Path.extname('file') returns empty string", () => {
  let result = Node_Path.extname("file")
  assertion(
    ~message="extname(file) is empty",
    ~operator="=",
    (a, b) => a == b,
    result,
    "",
  )
})

test("Node_Path.extname('file.tar.gz') returns .gz", () => {
  let result = Node_Path.extname("file.tar.gz")
  assertion(
    ~message="extname(file.tar.gz) is .gz",
    ~operator="=",
    (a, b) => a == b,
    result,
    ".gz",
  )
})

// ---------------------------------------------------------------------------
// basename — returns the last path component
// ---------------------------------------------------------------------------

test("Node_Path.basename('/foo/bar.txt') returns bar.txt", () => {
  let result = Node_Path.basename("/foo/bar.txt")
  assertion(
    ~message="basename(/foo/bar.txt) is bar.txt",
    ~operator="=",
    (a, b) => a == b,
    result,
    "bar.txt",
  )
})

test("Node_Path.basename('/foo/') returns foo", () => {
  let result = Node_Path.basename("/foo/")
  assertion(
    ~message="basename(/foo/) is foo",
    ~operator="=",
    (a, b) => a == b,
    result,
    "foo",
  )
})
