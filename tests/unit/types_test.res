// types_test.res — unit tests for Types constants per REQ-INJECTOR-1.

open Test

// ---------------------------------------------------------------------------
// REQ-INJECTOR-1: live-reload constants
// ---------------------------------------------------------------------------

test("Types.liveReloadEndpoint equals '/livereload'", () => {
  assertion(
    ~message="liveReloadEndpoint",
    ~operator="=",
    (a, b) => a == b,
    Types.liveReloadEndpoint,
    "/livereload",
  )
})

test("Types.liveReloadMessage equals 'reload'", () => {
  assertion(
    ~message="liveReloadMessage",
    ~operator="=",
    (a, b) => a == b,
    Types.liveReloadMessage,
    "reload",
  )
})
