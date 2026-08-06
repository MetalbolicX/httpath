// src/Security/ProtectedDir.res — startup guard for served-directory safety.
// Deny-list of OS system roots + best-effort privilege check + realpath resolution.
// REF: plans/011-protected-directory-guard.md

// ---------------------------------------------------------------------------
// Exception
// ---------------------------------------------------------------------------

exception ProtectedDirResolveError(string)

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type matchedRule =
  | PosixWellKnown(string)   // canonical path that matched
  | WindowsWellKnown(string)  // canonical path that matched
  | PrivilegeEscape(string)   // ancestor not owned + not world-readable

type verdict =
  | Allowed
  | Protected(matchedRule, string)  // (matchedRule, resolvedPath)

type denyList = {
  posix: array<string>,
  macos: array<string>,
  windows: array<string>,
  allowedPrefixes: array<string>,
}

// ---------------------------------------------------------------------------
// Reader seam (injectable for unit tests)
// ---------------------------------------------------------------------------

type reader = {
  realpathSync: string => string,
  statSync: string => Fs.stats,
  getuid: unit => int,
  platform: string,
  cwd: unit => string,
}

// ---------------------------------------------------------------------------
// Deny-list constant
// ---------------------------------------------------------------------------

// REF: plans/011-protected-directory-guard.md § "What counts as protected"
// NOTE: maintain this list together with the spec — see plan § maintenance notes.
let denyList: denyList = {
  posix: [
    "/",
    "/etc",
    "/boot",
    "/efi",
    "/proc",
    "/sys",
    "/dev",
    "/root",
    "/var/log",
    "/usr/sbin",
    "/sbin",
    "/bin",
    "/lib",
    "/lib64",
    "/run",
  ],
  macos: [
    "/System",
    "/Library",
    "/private/etc",
    "/usr",
  ],
  windows: [
    // Case-insensitive, backslash-normalised on Windows.
    "C:\\Windows",
    "C:\\Program Files",
    "C:\\Program Files (x86)",
    "C:\\ProgramData",
    "C:\\Recovery",
    "C:\\$Recycle.Bin",
    "C:\\",
    "D:\\",
  ],
  // Allowed prefixes: common legitimate doc roots not in deny-list.
  // REF: plan § "CI/sandbox containers".
  allowedPrefixes: [
    "/srv",
    "/usr/share",
    "/usr/local/share",
  ],
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

// Convert matchedRule to a human-readable rule name.
let ruleToString = (rule: matchedRule): string => {
  switch rule {
  | PosixWellKnown(path) => `POSIX well-known system root ("${path}")`
  | WindowsWellKnown(path) => `Windows well-known system root ("${path}")`
  | PrivilegeEscape(path) => `privilege-escape ancestor ("${path}")`
  }
}

// Normalise a Windows path for matching: lower-case, forward slashes.
let normaliseForMatch = (platform: string, path: string): string => {
  if platform == "win32" {
    Js.String.replaceByRe(/\\/g, "/", String.toLowerCase(path))
  } else {
    path
  }
}

// Does `resolved` start with any deny-list entry for the current platform?
let matchDenyList = (~platform: string, ~resolved: string): option<matchedRule> => {
  let norm = normaliseForMatch(platform, resolved)
  let platformDenyList = if platform == "win32" {
    denyList.windows
  } else if platform == "darwin" {
    denyList.macos
  } else {
    denyList.posix
  }
  let matched = Belt.Array.some(platformDenyList, entry => {
    norm == entry || Js.String.startsWith(norm ++ "/", entry ++ "/")
  })
  if matched {
    let rule = if platform == "win32" {
      WindowsWellKnown(resolved)
    } else {
      PosixWellKnown(resolved)
    }
    Some(rule)
  } else {
    None
  }
}

// Does `resolved` have an allowed prefix?
let isAllowedPrefix = (~resolved: string): bool => {
  Belt.Array.some(denyList.allowedPrefixes, prefix =>
    resolved == prefix || Js.String.startsWith(resolved ++ "/", prefix ++ "/")
  )
}

// Walk ancestors of `resolved`; check if any is privilege-protected.
// Returns PrivilegeEscape if an ancestor is found not owned by current uid
// and not world/group-readable. Degrades to None under uid 0.
let checkPrivilegeAncestors = (~reader: reader, ~_resolved: string): option<matchedRule> => {
  let uid = reader.getuid()
  // Under uid 0, privilege check is unreliable — degrade to deny-list-only.
  // REF: plan § STOP condition "privilege check unreliable as root".
  if uid == 0 {
    None
  } else {
    // Privilege check is deny-list-only for now because Node.Fs.stats binding
    // does not expose mode/uid/gid bits needed for a proper owner/world check.
    // REF: plan § "extend Node.Fs.stats binding" as future improvement.
    None
  }
}

// ---------------------------------------------------------------------------
// classifyWith — injectable for unit tests
// ---------------------------------------------------------------------------

let classifyWith = (reader: reader, ~directory: string): verdict => {
  let platform = reader.platform
  // Step 1: resolve real path.
  // Relative paths are resolved against cwd before realpath.
  let resolved = {
    let base = if Js.String.startsWith("/", directory) ||
      Js.String.includes(":", directory) {
      directory
    } else {
      reader.cwd() ++ "/" ++ directory
    }
    try {
      reader.realpathSync(base)
    } catch {
    | _ =>
      // realpath failure → typed error (plan § edge sub-case 3).
      throw(ProtectedDirResolveError(directory))
    }
  }
  // Step 2: deny-list check.
  switch matchDenyList(~platform, ~resolved) {
  | Some(rule) => Protected(rule, resolved)
  | None =>
    // Step 3: allowed-prefix check (CI doc roots override).
    if isAllowedPrefix(~resolved) {
      Allowed
    } else {
      // Step 4: best-effort privilege check (degrades under uid 0).
      switch checkPrivilegeAncestors(~reader, ~_resolved=resolved) {
      | Some(rule) => Protected(rule, resolved)
      | None => Allowed
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Production bindings
// ---------------------------------------------------------------------------

@module("node:fs")
external realpathSync: string => string = "realpathSync"

let classify = (~directory: string): verdict => {
  let reader: reader = {
    realpathSync: realpathSync,
    statSync: Fs.statSync,
    getuid: Process_info.getuid,
    platform: Process_info.platform,
    cwd: Process_info.cwd,
  }
  classifyWith(reader, ~directory)
}
