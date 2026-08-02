// AbortController.res — bindings for the Node.js AbortController API.
// Provides a fresh AbortSignal for coordinating shutdown via Httpath.

type t

@new external make: unit => t = "AbortController"

@get external signal: t => Signals.abortSignal = "signal"

@send external abort: t => unit = "abort"

// setOnAbort sets the onabort callback on an AbortSignal.
// This is used to register a listener that fires when abort() is called.
@set external setOnAbort: (Signals.abortSignal, unit => unit) => unit = "onabort"

let onAbort = (sig: Signals.abortSignal, cb: unit => unit): unit => {
  setOnAbort(sig, cb)
}
