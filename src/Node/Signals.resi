@scope("process")
@val external onSignal: (string, unit => unit) => unit = "on"

@scope("process")
@val external offSignal: (string, unit => unit) => unit = "off"

type abortSignal

@scope("AbortSignal")
@val external abortSignal: unit => abortSignal = "abortSignal"
