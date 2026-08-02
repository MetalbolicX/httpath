// AbortController.resi — public interface for AbortController bindings.

type t

// Construct a new AbortController.
let make: unit => t

// Read the AbortSignal from a controller.
let signal: t => Signals.abortSignal

// Signal abort on the controller.
let abort: t => unit

// Register a callback for when the signal is aborted.
let onAbort: (Signals.abortSignal, unit => unit) => unit
