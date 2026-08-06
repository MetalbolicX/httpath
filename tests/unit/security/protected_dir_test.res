// tests/unit/security/protected_dir_test.res — unit tests for ProtectedDir classifier.
// RED phase: these tests fail because ProtectedDir.classify does not exist yet.
// Once T-PDG-002 lands (GREEN), all 5 cases pass.

open Test

// ---------------------------------------------------------------------------
// ProtectedDir.classify — boundary scenarios per SCN-PDG-001..005
// ---------------------------------------------------------------------------

// SCN-PDG-001: POSIX well-known root refused at startup.
// GIVEN directory is /etc
// WHEN classify(~directory="/etc") is called
// THEN it returns Protected(PosixWellKnown("/etc"), resolvedPath) where resolvedPath == "/etc"
test("classify(/etc) returns Protected with PosixWellKnown rule", () => {
  let result = ProtectedDir.classify(~directory="/etc")
  switch result {
  | ProtectedDir.Protected(ProtectedDir.PosixWellKnown(rule), _) =>
    assertion(
      ~message="matched rule is /etc",
      ~operator="=",
      (a, b) => a == b,
      rule,
      "/etc",
    )
  | _ => JsError.throwWithMessage("expected Protected(PosixWellKnown('/etc'), ...)")
  }
})

// SCN-PDG-003: Allowed path starts silently.
// GIVEN directory is /tmp (not in deny-list)
// WHEN classify(~directory="/tmp") is called
// THEN it returns Allowed
test("classify(/tmp) returns Allowed (not in deny-list)", () => {
  let result = ProtectedDir.classify(~directory="/tmp")
  switch result {
  | ProtectedDir.Allowed => () // expected
  | Protected(_) => JsError.throwWithMessage("expected Allowed for /tmp")
  }
})

// SCN-PDG-004: Symlink into a protected root is refused.
// GIVEN a symlink whose target is /etc
// WHEN the startup guard resolves the real path
// THEN it returns Protected with the resolved target path
test("classify on symlink-to-/etc returns Protected with resolved path", () => {
  // Use a well-known temp path — test runner runs tests sequentially so no conflict
  let symlinkPath = "/tmp/httpath_protected_test_symlink"
  // Clean up any stale symlink from a previous failed run
  try {
    let _ = Fs.lstatSync(symlinkPath)
    Fs.unlinkSync(symlinkPath)
  } catch {
  | _ => ()
  }
  // Create a symlink to /etc
  Fs.symlinkSync("/etc", symlinkPath)
  let result = ProtectedDir.classify(~directory=symlinkPath)
  // Clean up
  Fs.unlinkSync(symlinkPath)
  switch result {
  | ProtectedDir.Protected(_, resolved) =>
    assertion(
      ~message="resolved path is /etc (symlink target)",
      ~operator="=",
      (a, b) => a == b,
      resolved,
      "/etc",
    )
  | ProtectedDir.Allowed => JsError.throwWithMessage("expected Protected for symlink-to-/etc")
  }
})

// SCN-PDG-003 / plan edge case 4: CI/sandbox doc roots allowed silently.
// GIVEN /usr/share (common doc root prefix, allowed by prefix rule)
// WHEN classify is called
// THEN it returns Allowed (not in deny-list)
test("classify(/usr/share) returns Allowed (CI doc root prefix)", () => {
  let result = ProtectedDir.classify(~directory="/usr/share")
  switch result {
  | ProtectedDir.Allowed => () // expected
  | Protected(_) => JsError.throwWithMessage("expected Allowed for /usr/share")
  }
})

// plan edge case 1 / SCN-PDG-003: relative path resolved against cwd.
// GIVEN cwd is the repo root and the directory is "src"
// WHEN classify resolves the real path
// THEN it returns Allowed (src is not protected)
test("classify(relative path) resolves against cwd and returns Allowed", () => {
  let result = ProtectedDir.classify(~directory="src")
  switch result {
  | ProtectedDir.Allowed => () // expected — repo/src is not protected
  | Protected(_) => JsError.throwWithMessage("expected Allowed for repo/src")
  }
})

// plan edge case 6: realpath failure throws ProtectedDirResolveError.
// GIVEN a non-existent directory
// WHEN classify is called
// THEN it throws ProtectedDirResolveError (not returns a verdict)
test("classify on non-existent directory throws ProtectedDirResolveError", () => {
  let threw = ref(false)
  try {
    let _ = ProtectedDir.classify(~directory="/nonexistent/path/does/not/exist")
    threw := false
  } catch {
  | ProtectedDir.ProtectedDirResolveError(_) => threw := true
  | _ => threw := false
  }
  assertion(
    ~message="non-existent path throws ProtectedDirResolveError",
    ~operator="=",
    (a, b) => a == b,
    threw.contents,
    true,
  )
})
