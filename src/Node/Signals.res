// Signals.res — Node process signal handler bindings and AbortSignal.

type abortSignal

@scope("process") @val external onSignal: (string, unit => unit) => unit = "on"

@scope("process") @val external offSignal: (string, unit => unit) => unit = "off"

// AbortSignal — accessible as a global constructor in Node >=15
@scope("AbortSignal") @val external abortSignal: unit => abortSignal = "abortSignal"
