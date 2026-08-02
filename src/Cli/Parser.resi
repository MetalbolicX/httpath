// Parser.resi — public interface for CLI argument parser.

let parse: array<string> => result<Config.t, ParseError.t>
