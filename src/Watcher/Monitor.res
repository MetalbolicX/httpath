// Monitor.res — typed recursive file-change watcher.
// REQ-FW-1 through REQ-FW-8.
//
// State invariants (per design #2832):
// - At most ONE pending timeout at any time.
// - Re-entrancy guard: drop events while processing.
// - No global state; start returns a handle.
// - Dispatch is synchronous after debounce.

type handle = {
  watcher: FsWatch.watcher,
  mutable pendingTimeout: option<Timers.timeoutId>,
  mutable cancelled: bool,
  mutable processing: bool,
  sigintHandler: unit => unit,
  sigtermHandler: unit => unit,
}

// ---------------------------------------------------------------------------
// Private helpers
// ---------------------------------------------------------------------------

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
  let cooldownActive = ref(false)
  let cancelled = ref(false)
  let processing = ref(false)

  // pendingTimeoutId ref is used by both callbacks and cancel.
  // When timeout fires, it sets itself to None.
  // When cancel is called, it clears the timeout and sets to None.
  // When new event arrives, it replaces the old timeout.
  let pendingTimeoutId = ref(None: option<Timers.timeoutId>)

  let checkCooldown = (): bool => {
    if cooldownActive.contents {
      false
    } else {
      cooldownActive.contents = true
      true
    }
  }

  // File change callback.
  let onEvent = (event: Types.fsEvent) => {
    switch event {
    | Types.Modified(filename) =>
      if cancelled.contents || processing.contents {
        () // drop: cancelled or re-entrancy guard
      } else {
        processing := true
        try {
          if IgnoreMatcher.matchesIgnorePattern(filename, ignorePatterns) {
            processing := false
            () // drop: ignored
          } else {
            // Clear existing timeout (trailing debounce — last event wins).
            switch pendingTimeoutId.contents {
            | Some(id) => Timers.clearTimeout(id)
            | None => ()
            }
            let timeoutId = Timers.setTimeout(
              () => {
                if cancelled.contents {
                  pendingTimeoutId := None
                  processing := false
                  ()
                } else {
                  // Determine action.
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
                      // onReload first if enableLiveReload (REQ-FW-6).
                      if enableLiveReload {
                        onReload()
                      }
                      onRestart()
                    }
                  }
                  pendingTimeoutId := None
                  processing := false
                }
              },
              500,
            )
            pendingTimeoutId := Some(timeoutId)
          }
        } catch {
        | _ =>
          pendingTimeoutId := None
          processing := false
        }
      }
    | _ => () // only Modified from FsWatch
    }
  }

  let watcher = FsWatch.watch(
    ~path=dir,
    ~options={recursive: true},
    ~onEvent,
  )

  // Signal handlers — stored in refs so they can reference each other.
  let sigintHandlerRef = ref(None: option<unit => unit>)
  let sigtermHandlerRef = ref(None: option<unit => unit>)

  let sigintHandler = () => {
    cancelled := true
    switch sigintHandlerRef.contents {
    | Some(h) => Signals.offSignal("SIGINT", h)
    | None => ()
    }
    switch sigtermHandlerRef.contents {
    | Some(h) => Signals.offSignal("SIGTERM", h)
    | None => ()
    }
    FsWatch.close(watcher)
    switch pendingTimeoutId.contents {
    | Some(id) => Timers.clearTimeout(id)
    | None => ()
    }
    pendingTimeoutId := None
  }

  let sigtermHandler = () => {
    cancelled := true
    switch sigintHandlerRef.contents {
    | Some(h) => Signals.offSignal("SIGINT", h)
    | None => ()
    }
    switch sigtermHandlerRef.contents {
    | Some(h) => Signals.offSignal("SIGTERM", h)
    | None => ()
    }
    FsWatch.close(watcher)
    switch pendingTimeoutId.contents {
    | Some(id) => Timers.clearTimeout(id)
    | None => ()
    }
    pendingTimeoutId := None
  }

  sigintHandlerRef := Some(sigintHandler)
  sigtermHandlerRef := Some(sigtermHandler)

  Signals.onSignal("SIGINT", sigintHandler)
  Signals.onSignal("SIGTERM", sigtermHandler)

  {
    watcher,
    pendingTimeout: None,
    cancelled: false,
    processing: false,
    sigintHandler,
    sigtermHandler,
  }
}

let cancel = (h: handle): unit => {
  h.cancelled = true
  Signals.offSignal("SIGINT", h.sigintHandler)
  Signals.offSignal("SIGTERM", h.sigtermHandler)
  FsWatch.close(h.watcher)
  switch h.pendingTimeout {
  | Some(id) => Timers.clearTimeout(id)
  | None => ()
  }
  h.pendingTimeout = None
  h.processing = false
}
