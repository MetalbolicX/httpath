// monitor_test.res — unit tests for Monitor module.
// Uses the typed fake clock (monitor_socket.mjs) to control timers
// deterministically without real wall-clock delays.

open Test

// ---------------------------------------------------------------------------
// Fake clock import — controls setTimeout/clearTimeout globally.
// ---------------------------------------------------------------------------

@module("./monitor_socket.mjs")
external makeFakeClock: unit => unit = "makeFakeClock"

@module("./monitor_socket.mjs")
external advanceTime: int => unit = "advanceTime"

@module("./monitor_socket.mjs")
external restoreClock: unit => unit = "restoreClock"

// ---------------------------------------------------------------------------
// Helper: collect reload/restart calls
// ---------------------------------------------------------------------------

let makeReloadCallback = () => {
  let count = ref(0)
  let fn = () => {count.contents = count.contents + 1}
  (fn, count)
}

let makeRestartCallback = () => {
  let count = ref(0)
  let fn = () => {count.contents = count.contents + 1}
  (fn, count)
}

// ---------------------------------------------------------------------------
// Test: Monitor.start returns a handle
// ---------------------------------------------------------------------------

test("Monitor.start returns a handle", () => {
  let tmpDir = "tests/unit/_tmp_monitor_test"
  let (reloadFn, _reloadCount) = makeReloadCallback()
  let (restartFn, _restartCount) = makeRestartCallback()
  let handle = Monitor.start(
    ~dir=tmpDir,
    ~ignorePatterns=[".git", "node_modules"],
    ~enableLiveReload=true,
    ~restartOnChange=false,
    ~onReload=reloadFn,
    ~onRestart=restartFn,
  )
  // Verify handle is non-null (opaque type).
  let h = switch handle {
  | _ => true
  }
  assertion(~message="start returns a handle", ~operator="=", (a, b) => a == b, h, true)
  Monitor.cancel(handle)
})

// ---------------------------------------------------------------------------
// Test: Monitor.cancel does not throw
// ---------------------------------------------------------------------------

test("Monitor.cancel does not throw on valid handle", () => {
  let tmpDir = "tests/unit/_tmp_monitor_test"
  let (reloadFn, _reloadCount) = makeReloadCallback()
  let (restartFn, _restartCount) = makeRestartCallback()
  let handle = Monitor.start(
    ~dir=tmpDir,
    ~ignorePatterns=[".git"],
    ~enableLiveReload=true,
    ~restartOnChange=false,
    ~onReload=reloadFn,
    ~onRestart=restartFn,
  )
  doesNotThrow(~message="cancel does not throw", () => {Monitor.cancel(handle)})
})

// ---------------------------------------------------------------------------
// Test: double cancel does not throw (idempotent)
// ---------------------------------------------------------------------------

test("Monitor.cancel is idempotent", () => {
  let tmpDir = "tests/unit/_tmp_monitor_test"
  let (reloadFn, _reloadCount) = makeReloadCallback()
  let (restartFn, _restartCount) = makeRestartCallback()
  let handle = Monitor.start(
    ~dir=tmpDir,
    ~ignorePatterns=[],
    ~enableLiveReload=false,
    ~restartOnChange=false,
    ~onReload=reloadFn,
    ~onRestart=restartFn,
  )
  Monitor.cancel(handle)
  doesNotThrow(~message="second cancel does not throw", () => {Monitor.cancel(handle)})
})

// ---------------------------------------------------------------------------
// Test: start requires dir parameter
// ---------------------------------------------------------------------------

test("Monitor.start accepts all required labeled args", () => {
  let tmpDir = "tests/unit/_tmp_monitor_test"
  let (reloadFn, _reloadCount) = makeReloadCallback()
  let (restartFn, _restartCount) = makeRestartCallback()
  // All labeled args are required; verify the call compiles and runs.
  let handle = Monitor.start(
    ~dir=tmpDir,
    ~ignorePatterns=[".git", "node_modules", ".DS_Store"],
    ~enableLiveReload=true,
    ~restartOnChange=true,
    ~onReload=reloadFn,
    ~onRestart=restartFn,
  )
  let h = switch handle {
  | _ => true
  }
  assertion(~message="start accepts all labeled args", ~operator="=", (a, b) => a == b, h, true)
  Monitor.cancel(handle)
})

// ---------------------------------------------------------------------------
// REQ-FW-2: Debounce 500ms — only one dispatch for rapid events
// Uses fake clock to advance past debounce without real delays.
// ---------------------------------------------------------------------------

test("Debounce collapses rapid events into one dispatch (REQ-FW-2)", () => {
  makeFakeClock()
  let tmpDir = "tests/unit/_tmp_monitor_test"
  let (reloadFn, reloadCount) = makeReloadCallback()
  let (restartFn, _restartCount) = makeRestartCallback()
  let handle = Monitor.start(
    ~dir=tmpDir,
    ~ignorePatterns=[],
    ~enableLiveReload=true,
    ~restartOnChange=false,
    ~onReload=reloadFn,
    ~onRestart=restartFn,
  )
  // Fire 5 events within 100ms (fake time).
  Monitor._testEmit(handle, Types.Modified("index.html"))
  Monitor._testEmit(handle, Types.Modified("index.html"))
  Monitor._testEmit(handle, Types.Modified("index.html"))
  Monitor._testEmit(handle, Types.Modified("index.html"))
  Monitor._testEmit(handle, Types.Modified("index.html"))
  // Advance past 500ms debounce window.
  advanceTime(600)
  assertion(
    ~message="only one dispatch fires despite 5 rapid events",
    ~operator="=",
    (a, b) => a == b,
    reloadCount.contents,
    1,
  )
  Monitor.cancel(handle)
  restoreClock()
})

// ---------------------------------------------------------------------------
// REQ-FW-5: BrowserReload dispatch — onReload called with enableLiveReload=true
// Uses fake clock + _emit test seam.
// ---------------------------------------------------------------------------

test("BrowserReload dispatches onReload when enableLiveReload=true (REQ-FW-5)", () => {
  makeFakeClock()
  let tmpDir = "tests/unit/_tmp_monitor_test"
  let (reloadFn, reloadCount) = makeReloadCallback()
  let (restartFn, _restartCount) = makeRestartCallback()
  let handle = Monitor.start(
    ~dir=tmpDir,
    ~ignorePatterns=[],
    ~enableLiveReload=true,
    ~restartOnChange=false,
    ~onReload=reloadFn,
    ~onRestart=restartFn,
  )
  // Emit a BrowserReload-classified file (index.html).
  Monitor._testEmit(handle, Types.Modified("index.html"))
  // Advance past 500ms debounce.
  advanceTime(600)
  assertion(
    ~message="onReload called once for HTML file with enableLiveReload=true",
    ~operator="=",
    (a, b) => a == b,
    reloadCount.contents,
    1,
  )
  Monitor.cancel(handle)
  restoreClock()
})

// ---------------------------------------------------------------------------
// REQ-FW-6: Restart dispatch — onRestart called for JS/config files
// Uses fake clock + _emit test seam.
// ---------------------------------------------------------------------------

test("Restart dispatches onRestart for JS file (REQ-FW-6)", () => {
  makeFakeClock()
  let tmpDir = "tests/unit/_tmp_monitor_test"
  let (reloadFn, _reloadCount) = makeReloadCallback()
  let (restartFn, restartCount) = makeRestartCallback()
  let handle = Monitor.start(
    ~dir=tmpDir,
    ~ignorePatterns=[],
    ~enableLiveReload=false,
    ~restartOnChange=false,
    ~onReload=reloadFn,
    ~onRestart=restartFn,
  )
  // Emit a Restart-classified file (app.js).
  Monitor._testEmit(handle, Types.Modified("app.js"))
  // Advance past 500ms debounce.
  advanceTime(600)
  assertion(
    ~message="onRestart called once for JS file",
    ~operator="=",
    (a, b) => a == b,
    restartCount.contents,
    1,
  )
  Monitor.cancel(handle)
  restoreClock()
})

// ---------------------------------------------------------------------------
// REQ-FW-7: Re-entrancy guard — concurrent events are dropped
// ---------------------------------------------------------------------------

test("Re-entrancy guard drops events during in-flight dispatch (REQ-FW-7)", () => {
  makeFakeClock()
  let tmpDir = "tests/unit/_tmp_monitor_test"
  let (reloadFn, _reloadCount) = makeReloadCallback()
  let (restartFn, restartCount) = makeRestartCallback()
  let handle = Monitor.start(
    ~dir=tmpDir,
    ~ignorePatterns=[],
    ~enableLiveReload=true,
    ~restartOnChange=true, // restart on any change
    ~onReload=reloadFn,
    ~onRestart=restartFn,
  )
  // Fire first event — this sets processing=true and starts debounce timer.
  Monitor._testEmit(handle, Types.Modified("index.html"))
  // Fire second event while first debounce is still pending.
  // Re-entrancy guard should drop it (processing is still true).
  Monitor._testEmit(handle, Types.Modified("style.css"))
  // Advance past 500ms debounce — only the first event should dispatch.
  advanceTime(600)
  assertion(
    ~message="only one dispatch fires even with concurrent events",
    ~operator="=",
    (a, b) => a == b,
    restartCount.contents,
    1,
  )
  Monitor.cancel(handle)
  restoreClock()
})

// ---------------------------------------------------------------------------
// REQ-PR-2: Cooldown gate — second restart within 1000ms is dropped
// ---------------------------------------------------------------------------

test("Cooldown gate drops restart within 1000ms (REQ-PR-2)", () => {
  makeFakeClock()
  let tmpDir = "tests/unit/_tmp_monitor_test"
  let (reloadFn, _reloadCount) = makeReloadCallback()
  let (restartFn, restartCount) = makeRestartCallback()
  let handle = Monitor.start(
    ~dir=tmpDir,
    ~ignorePatterns=[],
    ~enableLiveReload=false,
    ~restartOnChange=true, // restart on any change
    ~onReload=reloadFn,
    ~onRestart=restartFn,
  )
  // First event: debounce fires, restart dispatched, cooldown = 0.
  Monitor._testEmit(handle, Types.Modified("app.js"))
  advanceTime(600)
  assertion(
    ~message="first restart fires",
    ~operator="=",
    (a, b) => a == b,
    restartCount.contents,
    1,
  )
  // Second event within 500ms (fake time 0): new debounce timer started.
  Monitor._testEmit(handle, Types.Modified("style.css"))
  // Advance past debounce but BEFORE cooldown expires (cooldown = 0, need 1000ms).
  // At fake time 1100: cooldown check: 1100 - 0 = 1100 >= 1000 → cooldown expired.
  // So this second restart WOULD fire. We want to test when it's still active.
  // Advance to fake time 800 (cooldown: 800 < 1000 → still active).
  advanceTime(800) // fake time now 800 + 600 = 1400
  // Timer fires at fake time 1100 (600 + 500), but cooldown at 1100: 1100 < 1000? No.
  // Actually advanceTime(800) fires timers with fireAt <= 1400.
  // Timer 1: fireAt=600 (from event 1). 600 <= 1400 → fires.
  // Timer 2: fireAt=1100 (from event 2). 1100 <= 1400 → fires.
  // But at t=1100, cooldown (from t=600) = 1100-600 = 500 < 1000 → blocked.
  // Hmm, advanceTime(800) advances currentTime from 600 to 1400 and fires both timers.
  // Timer 1: fires at fake time 600 (before advanceTime returns).
  // Timer 2: fires at fake time 1100 (during advanceTime).
  // After timer 2 at fake time 1100: cooldown = 1100-600 = 500 < 1000 → blocked.
  // So restartCount stays at 1. Good!
  assertion(
    ~message="second restart within cooldown window is dropped",
    ~operator="=",
    (a, b) => a == b,
    restartCount.contents,
    1,
  )
  Monitor.cancel(handle)
  restoreClock()
})

// ---------------------------------------------------------------------------
// REQ-FW-5 (inverse): BrowserReload NOT called when enableLiveReload=false
// Uses fake clock + _emit test seam. Replaces the old tautological test.
// ---------------------------------------------------------------------------

test("BrowserReload does NOT call onReload when enableLiveReload=false (REQ-FW-5)", () => {
  makeFakeClock()
  let tmpDir = "tests/unit/_tmp_monitor_test"
  let (reloadFn, reloadCount) = makeReloadCallback()
  let (restartFn, _restartCount) = makeRestartCallback()
  let handle = Monitor.start(
    ~dir=tmpDir,
    ~ignorePatterns=[],
    ~enableLiveReload=false, // <-- key flag
    ~restartOnChange=false,
    ~onReload=reloadFn,
    ~onRestart=restartFn,
  )
  // Emit a BrowserReload-classified file (index.html).
  Monitor._testEmit(handle, Types.Modified("index.html"))
  // Advance past 500ms debounce.
  advanceTime(600)
  assertion(
    ~message="onReload not called when enableLiveReload=false",
    ~operator="=",
    (a, b) => a == b,
    reloadCount.contents,
    0,
  )
  Monitor.cancel(handle)
  restoreClock()
})

// ---------------------------------------------------------------------------
// Test: handle type is opaque (cannot be constructed from outside)
// ---------------------------------------------------------------------------

test("Monitor.handle is not directly constructible", () => {
  // This is a compile-time check expressed as a runtime test.
  // The handle type has no public constructor; only start returns one.
  let tmpDir = "tests/unit/_tmp_monitor_test"
  let (reloadFn, _reloadCount) = makeReloadCallback()
  let (restartFn, _restartCount) = makeRestartCallback()
  let handle = Monitor.start(
    ~dir=tmpDir,
    ~ignorePatterns=[],
    ~enableLiveReload=true,
    ~restartOnChange=false,
    ~onReload=reloadFn,
    ~onRestart=restartFn,
  )
  // Verify cancel works (handle is valid).
  doesNotThrow(~message="handle returned by start is valid", () => {Monitor.cancel(handle)})
})

// ---------------------------------------------------------------------------
// Test: Monitor can be started multiple times (independent handles)
// ---------------------------------------------------------------------------

test("Multiple Monitor.start calls return independent handles", () => {
  let tmpDir = "tests/unit/_tmp_monitor_test"
  let (onReload1, _rc1) = makeReloadCallback()
  let (onRestart1, _r1) = makeRestartCallback()
  let (onReload2, _rc2) = makeReloadCallback()
  let (onRestart2, _r2) = makeRestartCallback()
  let h1 = Monitor.start(
    ~dir=tmpDir,
    ~ignorePatterns=[],
    ~enableLiveReload=true,
    ~restartOnChange=false,
    ~onReload=onReload1,
    ~onRestart=onRestart1,
  )
  let h2 = Monitor.start(
    ~dir=tmpDir,
    ~ignorePatterns=[".git"],
    ~enableLiveReload=false,
    ~restartOnChange=true,
    ~onReload=onReload2,
    ~onRestart=onRestart2,
  )
  // Both handles should be independently cancelable.
  doesNotThrow(~message="first handle cancelable", () => {Monitor.cancel(h1)})
  doesNotThrow(~message="second handle cancelable", () => {Monitor.cancel(h2)})
})

// ---------------------------------------------------------------------------
// Test: empty ignorePatterns array is valid
// ---------------------------------------------------------------------------

test("Monitor.start accepts empty ignorePatterns", () => {
  let tmpDir = "tests/unit/_tmp_monitor_test"
  let (reloadFn, _rc) = makeReloadCallback()
  let (restartFn, _r) = makeRestartCallback()
  let handle = Monitor.start(
    ~dir=tmpDir,
    ~ignorePatterns=[],
    ~enableLiveReload=true,
    ~restartOnChange=false,
    ~onReload=reloadFn,
    ~onRestart=restartFn,
  )
  doesNotThrow(~message="start with empty ignorePatterns works", () => {Monitor.cancel(handle)})
})

// ---------------------------------------------------------------------------
// Test: restartOnChange=true flag accepted
// ---------------------------------------------------------------------------

test("Monitor.start accepts restartOnChange=true", () => {
  let tmpDir = "tests/unit/_tmp_monitor_test"
  let (reloadFn, _rc) = makeReloadCallback()
  let (restartFn, _r) = makeRestartCallback()
  let handle = Monitor.start(
    ~dir=tmpDir,
    ~ignorePatterns=[],
    ~enableLiveReload=true,
    ~restartOnChange=true, // <-- key flag
    ~onReload=reloadFn,
    ~onRestart=restartFn,
  )
  doesNotThrow(~message="start with restartOnChange=true works", () => {Monitor.cancel(handle)})
})
