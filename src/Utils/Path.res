// Utils_Path.res — safe path helpers for static-file handler.
// Provides resolveSafePath, matchesPattern, hasSymlinkPrefix per REQ-PATH-2..5.

module Path = Node_Path

// ---------------------------------------------------------------------------
// resolveSafePath — resolves base + requested, returns None if traversal
// faithful to path.mts:195-216
// ---------------------------------------------------------------------------

let resolveSafePath = (~base: string, ~requested: string): option<string> => {
  try {
    let resolvedBase = Path.resolve(base, "")
    // NOTE: We do NOT normalize `requested` before joining, because
    // Node_Path.normalize treats paths starting with "/" as absolute and
    // resolves them to the root (e.g. normalize("/../../../etc/passwd") -> "/etc/passwd").
    // The requested path is URL-decoded and always relative to base; use Path.join
    // which correctly resolves ".." segments relative to base.
    let fullPath = Path.join(resolvedBase, requested)
    let resolvedPath = Path.resolve(fullPath, "")
    let rel = Path.relative(resolvedBase, resolvedPath)
    if (
      String.startsWith(rel, "..") ||
      (rel === "" && resolvedPath !== resolvedBase)
    ) {
      None
    } else {
      Some(resolvedPath)
    }
  } catch {
  | _ => None
  }
}

// ---------------------------------------------------------------------------
// matchesPattern — checks if path matches any ignore pattern (consecutive
// segment window matching) faithful to path.mts:19-42
// ---------------------------------------------------------------------------

// Use global regex replace to replace ALL backslash occurrences
let replaceBackslashes = (s: string): string => {
  Js.String.replaceByRe(/\\/g, "/", s)
}

let matchesPattern = (~path: string, ~patterns: array<string>): bool => {
  let pathSegments = String.split(replaceBackslashes(path), "/")->Array.filter(s => s !== "")
  patterns->Array.some(pattern => {
    let patternSegments = String.split(replaceBackslashes(pattern), "/")->Array.filter(s => s !== "")
    let pLen = Array.length(patternSegments)
    let pathLen = Array.length(pathSegments)
    if (pLen === 0 || pLen > pathLen) {
      false
    } else {
      // Check every possible starting index in path
      let rec checkIndex = (i: int): bool => {
        if (i + pLen > pathLen) {
          false
        } else {
          // Check if all pattern segments match consecutive path segments starting at i
          let rec checkSeg = (j: int): bool => {
            if (j >= pLen) {
              true  // All pattern segments matched
            } else {
              let pathSeg = Array.get(pathSegments, i + j)->Option.getOr("")
              let patSeg = Array.get(patternSegments, j)->Option.getOr("")
              if (pathSeg === patSeg) {
                checkSeg(j + 1)
              } else {
                false
              }
            }
          }
          if (checkSeg(0)) {
            true
          } else {
            checkIndex(i + 1)  // Try next starting index
          }
        }
      }
      checkIndex(0)
    }
  })
}

// ---------------------------------------------------------------------------
// hasSymlinkPrefix — walks path segments checking for symlinks
// faithful to path.mts:50-75
// uses Fs.lstat (promise-based)
// ---------------------------------------------------------------------------

let hasSymlinkPrefix = (~base: string, ~target: string): promise<bool> => {
  let resolvedBase = Path.resolve(base, "")
  let resolvedTarget = Path.resolve(target, "")
  let rel = Path.relative(resolvedBase, resolvedTarget)
  if (String.startsWith(rel, "..")) {
    Promise.resolve(false)
  } else {
    let segments = String.split(rel, "/")->Array.filter(s => s !== "")
    let rec walk = (current: string, idx: int): promise<bool> => {
      if (idx >= Array.length(segments)) {
        Promise.resolve(false)
      } else {
        let next = Path.join(current, Array.get(segments, idx)->Option.getOr(""))
        Fs.lstat(next)->Promise.then(
          stat => {
            if (Fs.statIsSymlink(stat)) {
              Promise.resolve(true)
            } else {
              walk(next, idx + 1)
            }
          },
        )->Promise.catch(_error => {
          // NotFound means no symlink at this prefix
          Promise.resolve(false)
        })
      }
    }
    walk(resolvedBase, 0)
  }
}
