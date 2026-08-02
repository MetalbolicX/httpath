// AbortController_test.res — unit tests for AbortController module.

open Test

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

let makeAbortCallback = () => {
  let count = ref(0)
  let fn = () => { count.contents = count.contents + 1 }
  (fn, count)
}

// ---------------------------------------------------------------------------
// Test: make creates an AbortController instance
// ---------------------------------------------------------------------------

test("AbortController.make creates a controller with a valid signal", () => {
  let controller = AbortController.make()
  let sig = AbortController.signal(controller)
  // Verify the binding returns a truthy JS object (typeof !== "undefined").
  let isObject = Js.typeof(sig) != "undefined"
  assertion(
    ~message="make returns a controller with a valid signal (typeof !== undefined)",
    ~operator="==",
    (a, b) => a == b,
    isObject,
    true,
  )
})

// ---------------------------------------------------------------------------
// Test: signal is not aborted after construction
// ---------------------------------------------------------------------------

test("signal is not aborted immediately after make", () => {
  let controller = AbortController.make()
  let sig = AbortController.signal(controller)
  // Accessing aborted state would require additional binding; test via onabort not firing.
  let (cb, count) = makeAbortCallback()
  AbortController.onAbort(sig, cb)
  // Signal should not have aborted yet.
  assertion(
    ~message="signal onabort not yet fired after construction",
    ~operator="=",
    (a, b) => a == b,
    count.contents,
    0,
  )
})

// ---------------------------------------------------------------------------
// Test: abort fires onabort callback
// ---------------------------------------------------------------------------

test("abort() fires the onabort callback exactly once", () => {
  let controller = AbortController.make()
  let sig = AbortController.signal(controller)
  let (cb, count) = makeAbortCallback()
  AbortController.onAbort(sig, cb)
  AbortController.abort(controller)
  assertion(
    ~message="onabort called exactly once after abort()",
    ~operator="=",
    (a, b) => a == b,
    count.contents,
    1,
  )
})

// ---------------------------------------------------------------------------
// Test: double abort does not fire onabort twice
// ---------------------------------------------------------------------------

test("calling abort twice does not double-fire onabort", () => {
  let controller = AbortController.make()
  let sig = AbortController.signal(controller)
  let (cb, count) = makeAbortCallback()
  AbortController.onAbort(sig, cb)
  AbortController.abort(controller)
  AbortController.abort(controller)
  // onabort fires at most once even for double abort.
  assertion(
    ~message="onabort fires exactly once even with double abort",
    ~operator="=",
    (a, b) => a == b,
    count.contents,
    1,
  )
})

// ---------------------------------------------------------------------------
// Test: onAbort callback receives unit argument
// ---------------------------------------------------------------------------

test("onAbort callback is called with unit", () => {
  let controller = AbortController.make()
  let sig = AbortController.signal(controller)
  let called = ref(false)
  let cb = () => { called.contents = true }
  AbortController.onAbort(sig, cb)
  AbortController.abort(controller)
  assertion(
    ~message="callback was called",
    ~operator="=",
    (a, b) => a == b,
    called.contents,
    true,
  )
})
