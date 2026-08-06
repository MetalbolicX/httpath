// Probes.resi — health and readiness probe handlers.
// Probes are auth-exempt HTTP contracts for load-balancer / container-orchestrator
// liveness and drain-readiness checks.

type handler = Types.request => promise<Types.outcome>

type probeHandlers = {
  healthz: handler,
  readyz: handler,
}

// Individual probe handlers — exported for direct routing in Handler.res
// healthz: nullary handler (always returns 200 ok)
let healthz: handler

// readyz: takes draining ref, returns handler
let readyz: (~draining: ref<bool>) => handler

// Factory: builds a probe-handler record backed by the given draining ref.
// The draining ref is set by the SIGTERM handler in Httpath.res (T-HP-005, slice 2).
// Slice 1 uses a hardcoded ref(false) with a TODO noting where to wire the real ref.
let make: (~draining: ref<bool>) => probeHandlers
