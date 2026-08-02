// Node_Path.res — strict-typed bindings for node:path.
// Provides resolve, join, normalize, relative, extname, basename
// per REQ-PATH-1.

@module("node:path") external resolve: (string, string) => string = "resolve"
@module("node:path") external join: (string, string) => string = "join"
@module("node:path") external normalize: string => string = "normalize"
@module("node:path") external relative: (string, string) => string = "relative"
@module("node:path") external extname: string => string = "extname"
@module("node:path") external basename: (string) => string = "basename"
