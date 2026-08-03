type logLevel = Info | Debug | Error

let setLevel: logLevel => unit
let log: (logLevel, string) => unit
