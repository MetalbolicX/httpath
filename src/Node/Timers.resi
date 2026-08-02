// Node/Timers — public interface

type timeoutId

let setTimeout: (unit => unit, int) => timeoutId
let clearTimeout: timeoutId => unit
