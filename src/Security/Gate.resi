// Security/Gate — public interface

type gateDecision =
  | Allowed
  | Rejected({
      status: int,
      headers: array<(string, string)>,
      body: string,
      reason: string,
    })

type extractResult =
  | Found(string)
  | MissingHeader
  | WrongCredentials

let extractCredentials: (
  ~authHeader: option<string>,
  ~entries: array<Basic.entry>,
) => extractResult

let evaluateGate: (
  ~config: Config.t,
  ~authEntries: option<array<Basic.entry>>,
  ~rateLimiter: option<RateLimit.t>,
  ~clientIp: string,
  ~req: Types.request,
) => gateDecision

let checkOrigin: (~headers: array<(string, string)>, ~host: option<string>) => gateDecision
