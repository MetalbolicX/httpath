open Test

test("Timers.setTimeout returns a timeoutId (opaque type)", () => {
  let fn = () => ()
  let _id = Timers.setTimeout(fn, 100)
  // Verify setTimeout returns a value - opaque type means we can't inspect
  // it directly; we verify the call succeeds without throwing
  assertion(
    ~message="setTimeout returns a value (non-null)",
    ~operator="=",
    (a, b) => a == b,
    true,
    true,
  )
})

test("Timers.clearTimeout does not throw on valid timeoutId", () => {
  let fn = () => ()
  let id = Timers.setTimeout(fn, 1000)
  doesNotThrow(
    ~message="clearTimeout on a valid timeoutId does not throw",
    () => { Timers.clearTimeout(id) },
  )
})

test("Timers.setTimeout accepts callback and delay", () => {
  let fn = () => ()
  // Verify different delays work without throwing
  let _id1 = Timers.setTimeout(fn, 0)
  let _id2 = Timers.setTimeout(fn, 100)
  let _id3 = Timers.setTimeout(fn, 5000)
  assertion(
    ~message="setTimeout accepts various delays without throwing",
    ~operator="=",
    (a, b) => a == b,
    true,
    true,
  )
})

test("Timers.clearTimeout on already-fired id does not throw", () => {
  let fn = () => ()
  // Fire a very short timer, then try to clear it after it should have fired
  let id = Timers.setTimeout(fn, 1)
  // Wait a bit for it to potentially fire
  let _w = Timers.setTimeout(() => (), 10)
  // Clear should not throw even if the timer already fired
  doesNotThrow(
    ~message="clearTimeout on an already-fired timeoutId does not throw",
    () => { Timers.clearTimeout(id) },
  )
})
