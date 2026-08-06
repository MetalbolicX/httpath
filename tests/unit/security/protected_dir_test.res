// checkPrivilegeAncestors — privilege-escape runtime check (plan 019)
// Tests use Belt.Array.reduce-style inline switch callbacks per the working
// pattern established in Auth/Basic.res (lines 225-230).

open Test

// TC-PDA-1: uid 0 skips privilege checks (graceful degradation).
test("checkPrivilegeAncestors returns None for uid 0", () => {
  let mockReader: ProtectedDir.reader = {
    realpathSync: _ => "/srv/app",
    statSync: _ => { isFile: false, isDirectory: true, isSymlink: false, size: 4096, mode: 0o755, uid: 0, gid: 0 },
    getuid: () => 0,
    platform: "linux",
    cwd: () => "/",
  }
  let result = ProtectedDir.checkPrivilegeAncestors(~reader=mockReader, ~resolved="/srv/app/deep/nested")
  switch result {
  | None => () // expected
  | Some(_) => JsError.throwWithMessage("uid 0 should not check ancestors")
  }
})

// TC-PDA-2: win32 platform skips privilege checks.
test("checkPrivilegeAncestors returns None on win32", () => {
  let mockReader: ProtectedDir.reader = {
    realpathSync: _ => "C:\\Users\\Public",
    statSync: _ => { isFile: false, isDirectory: true, isSymlink: false, size: 4096, mode: 0o755, uid: 1000, gid: 1000 },
    getuid: () => 1000,
    platform: "win32",
    cwd: () => "C:\\",
  }
  let result = ProtectedDir.checkPrivilegeAncestors(~reader=mockReader, ~resolved="C:\\Users\\Public\\Documents")
  switch result {
  | None => () // expected
  | Some(_) => JsError.throwWithMessage("win32 should not check ancestors")
  }
})

// TC-PDA-3: all ancestors owned by current uid → None (no privilege escape).
test("checkPrivilegeAncestors returns None when all ancestors owned by caller uid", () => {
  let uid = 9999
  let mockReader: ProtectedDir.reader = {
    realpathSync: _ => "/home/app/data",
    statSync: path => {
      let isDir = !Js.String.includes(".", path)
      { isFile: !isDir, isDirectory: isDir, isSymlink: false, size: 4096, mode: 0o755, uid: uid, gid: uid }
    },
    getuid: () => uid,
    platform: "linux",
    cwd: () => "/",
  }
  let result = ProtectedDir.checkPrivilegeAncestors(~reader=mockReader, ~resolved="/home/app/data")
  switch result {
  | None => () // expected
  | Some(rule) => JsError.throwWithMessage("all ancestors owned by caller: " ++ ProtectedDir.ruleToString(rule))
  }
})

// TC-PDA-4: ancestor not owned by caller BUT world-readable (mode has o+r) → None.
test("checkPrivilegeAncestors returns None when non-owned ancestor is world-readable", () => {
  let uid = 9999
  let mockReader: ProtectedDir.reader = {
    realpathSync: _ => "/tmp/app/data",
    statSync: path => {
      let isDir = !Js.String.includes(".", path)
      let ownerUid = if path == "/tmp" || path == "/tmp/app" { 0 } else { uid }
      // mode 0o755: owner rwx, group r-x, other r-x → world-readable
      { isFile: !isDir, isDirectory: isDir, isSymlink: false, size: 4096, mode: 0o755, uid: ownerUid, gid: 0 }
    },
    getuid: () => uid,
    platform: "linux",
    cwd: () => "/",
  }
  let result = ProtectedDir.checkPrivilegeAncestors(~reader=mockReader, ~resolved="/tmp/app/data")
  switch result {
  | None => () // expected
  | Some(rule) => JsError.throwWithMessage("world-readable ancestor should not block: " ++ ProtectedDir.ruleToString(rule))
  }
})

// TC-PDA-5: ancestor not owned by caller AND not world-readable → Some(PrivilegeEscape).
test("checkPrivilegeAncestors returns PrivilegeEscape when non-owned ancestor is not world-readable", () => {
  let uid = 9999
  let mockReader: ProtectedDir.reader = {
    realpathSync: _ => "/root/app/data",
    statSync: path => {
      let isDir = !Js.String.includes(".", path)
      let ownerUid = if path == "/root" || path == "/root/app" { 0 } else { uid }
      // mode 0o750: owner rwx, group r-x, other --- → NOT world-readable
      { isFile: !isDir, isDirectory: isDir, isSymlink: false, size: 4096, mode: 0o750, uid: ownerUid, gid: 0 }
    },
    getuid: () => uid,
    platform: "linux",
    cwd: () => "/",
  }
  let result = ProtectedDir.checkPrivilegeAncestors(~reader=mockReader, ~resolved="/root/app/data")
  switch result {
  | Some(ProtectedDir.PrivilegeEscape(path)) =>
    assertion(
      ~message="privilege escape detected on /root/app (leafmost tripped ancestor)",
      ~operator="=",
      (a, b) => a == b,
      path,
      "/root/app",
    )
  | Some(rule) => JsError.throwWithMessage("expected PrivilegeEscape, got: " ++ ProtectedDir.ruleToString(rule))
  | None => JsError.throwWithMessage("expected PrivilegeEscape for non-owned, non-world-readable ancestor")
  }
})



// ---------------------------------------------------------------------------
// ProtectedDir.classify — boundary scenarios per SCN-PDG-001..005

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
