// Node/Timers — strict-typed external for Node.js global timers.

type timeoutId

@val external setTimeout: (unit => unit, int) => timeoutId = "setTimeout"
@val external clearTimeout: timeoutId => unit = "clearTimeout"
