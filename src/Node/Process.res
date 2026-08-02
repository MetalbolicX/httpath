// Node/Process — strict-typed external for Node.js process global.

@scope("process") @val external exit: int => unit = "exit"
@scope("process") @val external argv: array<string> = "argv"
@scope("process") @val external cwd: unit => string = "cwd"
