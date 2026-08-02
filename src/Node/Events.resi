// Node/Events — public interface

let on: (Http.serverSocket, string, unit => unit) => Http.serverSocket
let remove: (Http.serverSocket, string, unit => unit) => Http.serverSocket
