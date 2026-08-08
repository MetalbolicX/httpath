type decision = Allow | Locked({retryAfterSeconds: int})
type t
let make: (
  ~maxFailures: int=?,
  ~baseLockoutMs: float=?,
  ~maxLockoutMs: float=?,
  ~maxIps: int=?,
  ~now: unit => float,
) => t
let check: (t, string) => decision
let recordFailure: (t, string) => unit
let recordSuccess: (t, string) => unit