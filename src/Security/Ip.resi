// Ip.resi — IP resolution and CIDR matching security utilities.

exception InvalidCidr(string)

let cidrMatch: (string, string) => bool
let resolveClientIp: (~peer: string, ~xff: array<string>, ~trustedCidrs: array<string>) => string
