// Node/Events — strict-typed externals for EventEmitter on serverSocket.
// Uses @send for instance methods; net.Socket is an EventEmitter.

@send external on: (Http.serverSocket, string, unit => unit) => Http.serverSocket = "on"

@send external remove: (Http.serverSocket, string, unit => unit) => Http.serverSocket = "removeListener"
