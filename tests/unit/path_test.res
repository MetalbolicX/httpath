// path_test.res — unit tests for Utils/Path helpers.
// Tests resolveSafePath, matchesPattern, hasSymlinkPrefix
// per REQ-PATH-2..5.

open Test

// ---------------------------------------------------------------------------
// REQ-PATH-2: resolveSafePath
// ---------------------------------------------------------------------------

test("resolveSafePath: safe relative path returns resolved absolute", () => {
  let result = Path.resolveSafePath(~base="/srv", ~requested="./files/index.html")
  switch result {
  | Some(p) =>
    assertion(
      ~message="resolved path starts with base",
      ~operator="=",
      (a, b) => a == b,
      String.startsWith(p, "/srv"),
      true,
    )
  | None => JsError.throwWithMessage("Expected Some but got None for safe path")
  }
})

test("resolveSafePath: traversal attempt returns None", () => {
  let result = Path.resolveSafePath(~base="/srv", ~requested="../../../etc/passwd")
  assertion(~message="traversal returns None", ~operator="=", (a, b) => a == b, result, None)
})

test("resolveSafePath: absolute path /etc alongside /srv returns Some (not traversal)", () => {
  // /etc/passwd does NOT use .. so it is NOT a traversal in Node's path.join
  let result = Path.resolveSafePath(~base="/srv", ~requested="/etc/passwd")
  switch result {
  | Some(p) =>
    assertion(
      ~message="/etc/passwd resolves to /srv/etc/passwd (alongside, not above)",
      ~operator="=",
      (a, b) => a == b,
      p,
      "/srv/etc/passwd",
    )
  | None => JsError.throwWithMessage("Expected Some for /etc/passwd alongside /srv")
  }
})

test("resolveSafePath: exact base match returns Some(base)", () => {
  let result = Path.resolveSafePath(~base="/srv", ~requested=".")
  switch result {
  | Some(p) =>
    assertion(~message="requested '.' resolves to base", ~operator="=", (a, b) => a == b, p, "/srv")
  | None => JsError.throwWithMessage("Expected Some for exact base match")
  }
})

// ---------------------------------------------------------------------------
// REQ-PATH-3: matchesPattern
// ---------------------------------------------------------------------------

test("matchesPattern: path containing node_modules matches 'node_modules'", () => {
  let result = Path.matchesPattern(~path="src/node_modules/foo/bar.js", ~patterns=["node_modules"])
  assertion(
    ~message="node_modules pattern matches in path",
    ~operator="=",
    (a, b) => a == b,
    result,
    true,
  )
})

test("matchesPattern: path without node_modules does not match", () => {
  let result = Path.matchesPattern(~path="src/app/main.js", ~patterns=["node_modules"])
  assertion(
    ~message="app/main.js does not match node_modules",
    ~operator="=",
    (a, b) => a == b,
    result,
    false,
  )
})

test("matchesPattern: pattern longer than path does not match", () => {
  let result = Path.matchesPattern(~path="a/b", ~patterns=["a/b/c"])
  assertion(
    ~message="pattern longer than path returns false",
    ~operator="=",
    (a, b) => a == b,
    result,
    false,
  )
})

test("matchesPattern: exact segment match works", () => {
  let result = Path.matchesPattern(~path="src/config/settings.json", ~patterns=["config"])
  assertion(
    ~message="config pattern matches src/config/settings.json",
    ~operator="=",
    (a, b) => a == b,
    result,
    true,
  )
})

test("matchesPattern: empty pattern returns false", () => {
  let result = Path.matchesPattern(~path="src/app/main.js", ~patterns=[""])
  assertion(~message="empty pattern returns false", ~operator="=", (a, b) => a == b, result, false)
})

test("matchesPattern: backslash separator is normalized to forward slash", () => {
  let result = Path.matchesPattern(~path="src\\node_modules\\foo.js", ~patterns=["node_modules"])
  assertion(
    ~message="backslash path normalized to forward slash for matching",
    ~operator="=",
    (a, b) => a == b,
    result,
    true,
  )
})
