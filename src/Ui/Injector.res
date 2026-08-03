// Injector.res — live-reload script injection per REQ-INJECTOR-2..3.
// Faithful port of src/ui/injector.mts:19-72.

let liveReloadScript = (~port: int): string => {
  let scriptContent =
    "(() => { " ++
    "const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'; " ++
    "const clientPort = window.location.port || '" ++
    Int.toString(port) ++
    "'; " ++
    "const wsUrl = protocol + '//' + window.location.hostname + ':' + clientPort + '" ++
    Types.liveReloadEndpoint ++
    "'; " ++
    "const connect = () => { " ++
    "const ws = new WebSocket(wsUrl); " ++
    "ws.onopen = () => console.log('[Live Reload] Connected'); " ++
    "ws.onmessage = (event) => { " ++
    "if (event.data === '" ++
    Types.liveReloadMessage ++
    "') { " ++
    "console.log('[Live Reload] Reloading page...'); " ++
    "window.location.reload(); " ++
    "} " ++
    "}; " ++
    "ws.onclose = () => { " ++
    "console.log('[Live Reload] Connection closed, attempting to reconnect...'); " ++
    "setTimeout(connect, 1000); " ++
    "}; " ++
    "ws.onerror = () => { " ++
    "console.log('[Live Reload] Connection error, attempting to reconnect...'); " ++
    "setTimeout(connect, 1000); " ++
    "}; " ++
    "}; " ++
    "connect(); " ++ "})();"
  "<script>\n" ++ scriptContent ++ "\n</script>"
}

let injectLiveReloadScript = (~html: string, ~port: int): string => {
  let script = liveReloadScript(~port)
  if String.includes(html, "</body>") {
    String.replace(html, "</body>", script ++ "\n</body>")
  } else if String.includes(html, "</html>") {
    String.replace(html, "</html>", script ++ "\n</html>")
  } else {
    html ++ "\n" ++ script
  }
}
