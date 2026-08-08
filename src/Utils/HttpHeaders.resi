// Public surface of Utils/Headers.

let get: array<(string, string)> => string => option<string>
let getContentLength: array<(string, string)> => option<int>
let getUpgradeHeader: array<(string, string)> => option<string>
