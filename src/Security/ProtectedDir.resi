// src/Security/ProtectedDir.resi — typed classification of served directory safety.

// Exception thrown when realpath resolution fails.
exception ProtectedDirResolveError(string)

// The matched-rule tag carried in a Protected verdict.
type matchedRule =
  | PosixWellKnown(string)   // canonical path that matched
  | WindowsWellKnown(string) // canonical path that matched
  | PrivilegeEscape(string)   // ancestor not owned + not world-readable

// The classification verdict.
type verdict =
  | Allowed                       // not protected
  | Protected(matchedRule, string)  // (matchedRule, resolvedPath)

// OS-specific deny-list plus allowed prefixes.
type denyList = {
  posix: array<string>,
  macos: array<string>,
  windows: array<string>,
  allowedPrefixes: array<string>,
}

// The reader seam — injectable for unit tests.
// All filesystem and process calls go through this record.
type reader = {
  realpathSync: string => string,
  statSync: string => Fs.stats,
  getuid: unit => int,
  platform: string,
  cwd: unit => string,
}

// The deny-list constant (OS-specific).
let denyList: denyList

// checkPrivilegeAncestors — runtime privilege-escape ancestor walk (plan 019).
let checkPrivilegeAncestors: (~reader: reader, ~resolved: string) => option<matchedRule>

// classifyWith — pure aside from the reader; used by unit tests.
let classifyWith: (reader, ~directory: string) => verdict

// classify — production entry point; uses Node.js bindings.
let classify: (~directory: string) => verdict

// ruleToString — human-readable name for a matchedRule.
let ruleToString: matchedRule => string
