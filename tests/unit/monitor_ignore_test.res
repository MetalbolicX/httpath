// monitor_ignore_test.res — unit tests for the ignore pattern matcher.
// Tests the matchesIgnorePattern logic in isolation.

open Test

// ---------------------------------------------------------------------------
// Test: empty patterns match nothing
// ---------------------------------------------------------------------------

test("empty patterns match nothing", () => {
  let patterns = []
  let result = IgnoreMatcher.matchesIgnorePattern("foo.txt", patterns)
  assertion(
    ~message="empty patterns array matches nothing",
    ~operator="=",
    (a, b) => a == b,
    result,
    false,
  )
})

// ---------------------------------------------------------------------------
// Test: exact substring match (case insensitive)
// ---------------------------------------------------------------------------

test("exact substring match is case insensitive", () => {
  let patterns = ["node_modules", ".git"]
  let r1 = IgnoreMatcher.matchesIgnorePattern("node_modules/foo.js", patterns)
  let r2 = IgnoreMatcher.matchesIgnorePattern("NODE_MODULES/foo.js", patterns)
  let r3 = IgnoreMatcher.matchesIgnorePattern("Node_Modules/foo.js", patterns)
  assertion(~message="node_modules matches lowercase", ~operator="=", (a, b) => a == b, r1, true)
  assertion(~message="node_modules matches uppercase", ~operator="=", (a, b) => a == b, r2, true)
  assertion(~message="node_modules matches mixed", ~operator="=", (a, b) => a == b, r3, true)
})

// ---------------------------------------------------------------------------
// Test: glob prefix pattern (foo*)
// ---------------------------------------------------------------------------

test("glob prefix pattern matches start of path", () => {
  let patterns = ["deno*"]
  let r1 = IgnoreMatcher.matchesIgnorePattern("deno.json", patterns)
  let r2 = IgnoreMatcher.matchesIgnorePattern("deno.lock", patterns)
  let r3 = IgnoreMatcher.matchesIgnorePattern("deno.json.lock", patterns)
  let r4 = IgnoreMatcher.matchesIgnorePattern("my-deno.json", patterns)
  assertion(~message="deno.json matches", ~operator="=", (a, b) => a == b, r1, true)
  assertion(~message="deno.lock matches", ~operator="=", (a, b) => a == b, r2, true)
  assertion(~message="deno.json.lock matches (deno prefix)", ~operator="=", (a, b) => a == b, r3, true)
  assertion(~message="my-deno.json does not match (not prefix)", ~operator="=", (a, b) => a == b, r4, false)
})

// ---------------------------------------------------------------------------
// Test: glob suffix pattern (*.js)
// ---------------------------------------------------------------------------

test("glob suffix pattern matches end of path", () => {
  let patterns = ["*.js", "*.ts"]
  let r1 = IgnoreMatcher.matchesIgnorePattern("foo.js", patterns)
  let r2 = IgnoreMatcher.matchesIgnorePattern("bar.ts", patterns)
  let r3 = IgnoreMatcher.matchesIgnorePattern("foo.jsx", patterns)
  // Note: substring match means "foo.module.js" contains ".js" and matches *.js
  let r4 = IgnoreMatcher.matchesIgnorePattern("foo.module.js", patterns)
  assertion(~message="foo.js matches", ~operator="=", (a, b) => a == b, r1, true)
  assertion(~message="bar.ts matches", ~operator="=", (a, b) => a == b, r2, true)
  assertion(~message="foo.jsx does not match (extra suffix)", ~operator="=", (a, b) => a == b, r3, false)
  // foo.module.js contains .js as substring, so matches *.js per substring semantics
  assertion(~message="foo.module.js matches *.js (substring)", ~operator="=", (a, b) => a == b, r4, true)
})

// ---------------------------------------------------------------------------
// Test: glob contains pattern (*foo*)
// ---------------------------------------------------------------------------

test("glob contains pattern matches anywhere", () => {
  let patterns = ["*test*"]
  let r1 = IgnoreMatcher.matchesIgnorePattern("test/file.txt", patterns)
  let r2 = IgnoreMatcher.matchesIgnorePattern("mytest.txt", patterns)
  let r3 = IgnoreMatcher.matchesIgnorePattern("file.test.js", patterns)
  let r4 = IgnoreMatcher.matchesIgnorePattern("testing.txt", patterns)
  assertion(~message="test/file.txt matches", ~operator="=", (a, b) => a == b, r1, true)
  assertion(~message="mytest.txt matches", ~operator="=", (a, b) => a == b, r2, true)
  assertion(~message="file.test.js matches", ~operator="=", (a, b) => a == b, r3, true)
  assertion(~message="testing.txt matches", ~operator="=", (a, b) => a == b, r4, true)
})

// ---------------------------------------------------------------------------
// Test: default patterns from spec
// ---------------------------------------------------------------------------

test("default ignore patterns from spec", () => {
  let patterns = [".git", "node_modules", ".DS_Store"]
  let r1 = IgnoreMatcher.matchesIgnorePattern(".git/config", patterns)
  let r2 = IgnoreMatcher.matchesIgnorePattern("node_modules/lodash/index.js", patterns)
  let r3 = IgnoreMatcher.matchesIgnorePattern(".DS_Store", patterns)
  let r4 = IgnoreMatcher.matchesIgnorePattern("src/app.js", patterns)
  assertion(~message=".git/config is ignored", ~operator="=", (a, b) => a == b, r1, true)
  assertion(~message="node_modules/... is ignored", ~operator="=", (a, b) => a == b, r2, true)
  assertion(~message=".DS_Store is ignored", ~operator="=", (a, b) => a == b, r3, true)
  assertion(~message="src/app.js is not ignored", ~operator="=", (a, b) => a == b, r4, false)
})

// ---------------------------------------------------------------------------
// Test: mixed case patterns are case insensitive
// ---------------------------------------------------------------------------

test("patterns are matched case insensitively", () => {
  let patterns = [".GIT", "NODE_MODULES"]
  let r1 = IgnoreMatcher.matchesIgnorePattern(".git/hooks", patterns)
  let r2 = IgnoreMatcher.matchesIgnorePattern("NODE_MODULES/pkg/index.js", patterns)
  let r3 = IgnoreMatcher.matchesIgnorePattern("Node_Modules/pkg/index.js", patterns)
  assertion(~message=".git/hooks matches .GIT pattern", ~operator="=", (a, b) => a == b, r1, true)
  assertion(~message="NODE_MODULES matches NODE_MODULES pattern", ~operator="=", (a, b) => a == b, r2, true)
  assertion(~message="Node_Modules matches NODE_MODULES pattern", ~operator="=", (a, b) => a == b, r3, true)
})

// ---------------------------------------------------------------------------
// Test: non-matching pattern returns false
// ---------------------------------------------------------------------------

test("non-matching pattern returns false", () => {
  let patterns = [".git", "node_modules"]
  let r = IgnoreMatcher.matchesIgnorePattern("src/app.ts", patterns)
  assertion(
    ~message="src/app.ts is not ignored by .git/node_modules",
    ~operator="=",
    (a, b) => a == b,
    r,
    false,
  )
})
