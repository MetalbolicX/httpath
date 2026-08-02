// Monitor.res — typed recursive file-change watcher.
// REQ-FW-1 through REQ-FW-8.
//
// State invariants (per design #2832):
// - At most ONE pending timeout at any time.
// - Re-entrancy guard: drop events while processing.
// - No global state; start returns a handle.
// - Dispatch is synchronous after debounce.

@scope("Date") @val external now: unit => float = "now"

type handle = {
  mutable watcher: FsWatch.watcher,
  mutable cancelled: bool,
  mutable processing: bool,
  mutable pendingTimeoutId: option<Timers.timeoutId>,
  mutable _emit: Types.fsEvent => unit,
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

let start = (
  ~dir: string,
  ~ignorePatterns: array<string>,
  ~enableLiveReload: bool,
  ~restartOnChange: bool,
  ~onReload: unit => unit,
  ~onRestart: unit => unit,
): handle => {
  let cooldownMs = 1000.0
  let lastRestartAt = ref(0.0)

  // Allocate handle first so callbacks can capture it.
  let h: handle = {
    watcher: Obj.magic(null),
    cancelled: false,
    processing: false,
    pendingTimeoutId: None,
    _emit: (_) => (),
  }

  let checkCooldown = (): bool => {
    let now = now()
    if now -. lastRestartAt.contents < cooldownMs {
      false
    } else {
      lastRestartAt := now
      true
    }
  }

  // File change callback — reads/writes handle fields directly.
  let onEvent = (event: Types.fsEvent) => {
    switch event {
    | Types.Modified(filename) =>
      if h.cancelled || h.processing {
        () // drop: cancelled or re-entrancy guard
      } else {
        h.processing = true
        if IgnoreMatcher.matchesIgnorePattern(filename, ignorePatterns) {
          h.processing = false
          () // drop: ignored
        } else {
          // Clear existing timeout (trailing debounce — last event wins).
          switch h.pendingTimeoutId {
          | Some(id) => Timers.clearTimeout(id)
          | None => ()
          }
          let timeoutId = Timers.setTimeout(
            () => {
              if h.cancelled {
                h.pendingTimeoutId = None
                h.processing = false
                ()
              } else {
                let action =
                  if restartOnChange {
                    Rules.Restart
                  } else {
                    Rules.decide(filename)
                  }
                switch action {
                | Rules.Ignore => ()
                | Rules.BrowserReload =>
                  if enableLiveReload {
                    onReload()
                  }
                | Rules.Restart =>
                  if checkCooldown() {
                    if enableLiveReload {
                      onReload()
                    }
                    onRestart()
                  }
                }
                h.pendingTimeoutId = None
                h.processing = false
              }
            },
            500,
          )
          h.pendingTimeoutId = Some(timeoutId)
        }
      }
    | _ => () // only Modified from FsWatch
    }
  }

  // Now set the test seam before starting the watcher.
  h._emit = onEvent

  let watcher = FsWatch.startWatcher(
    ~path=dir,
    ~options={recursive: true},
    ~onEvent,
  )
  h.watcher = watcher

  h
}

let cancel = (h: handle): unit => {
  h.cancelled = true
  FsWatch.close(h.watcher)
  switch h.pendingTimeoutId {
  | Some(id) => Timers.clearTimeout(id)
  | None => ()
  }
  h.pendingTimeoutId = None
  h.processing = false
}

// test-only: emit a synthetic file-change event directly into the Monitor's
// internal event path. Used by unit tests to exercise debounce, dispatch,
// re-entrancy, and cooldown without requiring a real filesystem.
let _testEmit = (h: handle, event: Types.fsEvent): unit => {
  h._emit(event)
}
