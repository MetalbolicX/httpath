// src/Utils/Logger.resi — interface for the Logger module.

type logLevel = Info | Debug | Error
type mode = Json | Plain

let setLevel: logLevel => unit
let setMode: mode => unit
let getMode: unit => mode
let getLevel: unit => logLevel
let log: (logLevel, string) => unit
