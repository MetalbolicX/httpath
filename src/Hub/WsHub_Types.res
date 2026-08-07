// WsHub_Types — shared types for WsHub cap rejection errors.

type capReason = PerIp | Global

type capRejected = CapRejected({ reason: capReason, clientIp: string })
