// Headers.resi — security headers interface per REQ-HEADERS-1..2.

let securityHeaders: array<(string, string)>
let hstsHeader: (string, string)
let withSecurityHeaders: (~cspOverride: string=?, array<(string, string)>) => array<(string, string)>
