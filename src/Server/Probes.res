// Probes.res — health and readiness probe handlers.
// Health contract: GET /healthz always returns 200 while the server is up.
// Readiness contract: GET /readyz returns 200 when ready, 503 when draining.

type handler = Types.request => promise<Types.outcome>

// ---------------------------------------------------------------------------
// JSON response helpers
// ---------------------------------------------------------------------------

let jsonResponse = (~status: int, ~body: string): Types.outcome => {
  let headers = Headers.withSecurityHeaders([
    ("content-type", "application/json"),
  ])
  Types.Respond({
    status,
    headers,
    body: Types.Html(body),
  })
}

let healthzBody = "{\"status\":\"ok\"}"
let readyzBody = "{\"status\":\"ready\"}"
let drainingBody = "{\"status\":\"draining\"}"

// ---------------------------------------------------------------------------
// Individual handlers — used when Handler.res intercepts the path directly
// ---------------------------------------------------------------------------

let healthz = (_request: Types.request): promise<Types.outcome> => {
  Promise.resolve(jsonResponse(~status=200, ~body=healthzBody))
}

let readyz = (~draining: ref<bool>, _request: Types.request): promise<Types.outcome> => {
  if draining.contents {
    Promise.resolve(jsonResponse(~status=503, ~body=drainingBody))
  } else {
    Promise.resolve(jsonResponse(~status=200, ~body=readyzBody))
  }
}

// ---------------------------------------------------------------------------
// Factory — builds a record of probe handlers backed by the draining ref
// ---------------------------------------------------------------------------

type probeHandlers = {
  healthz: Types.request => promise<Types.outcome>,
  readyz: Types.request => promise<Types.outcome>,
}

let make = (~draining: ref<bool>): probeHandlers => {
  let h = (_req: Types.request) => healthz(_req)
  let r = (req: Types.request) => readyz(~draining, req)
  {healthz: h, readyz: r}
}
