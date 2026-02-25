/**
 * Get the live reload script for the given port.
 * @param port - The port number to use for the live reload script.
 * @returns The live reload script as a string.
 */
export const getLiveReloadScript = (port: number): string => /*html*/ `
<script>
(() => {
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  const wsUrl = \`\${protocol}//\${window.location.hostname}:\${${port}}/livereload\`;

  const connect = () => {
    const ws = new WebSocket(wsUrl);

    ws.onopen = () => console.log('[Live Reload] Connected');

    ws.onmessage = (event) => {
      if (event.data === 'reload') {
        console.log('[Live Reload] Reloading page...');
        window.location.reload();
      }
    };

    ws.onclose = () => {
      console.log('[Live Reload] Connection closed, attempting to reconnect...');
      setTimeout(connect, 1000);
    };

    ws.onerror = () => {
      console.log('[Live Reload] Connection error, attempting to reconnect...');
      setTimeout(connect, 1000);
    };
  };

  connect();
})();
</script>`;

/**
 * Inject the live reload script into the given HTML string.
 * @param html - The HTML string to inject the script into.
 * @param port - The port number to use for the live reload script.
 * @returns The HTML string with the live reload script injected.
 */
export const injectLiveReloadScript = (html: string, port: number): string => {
    const script = getLiveReloadScript(port);
    if (html.includes("</body>")) {
        return html.replace("</body>", `${script}\n</body>`);
    } else if (html.includes("</html>")) {
        return html.replace("</html>", `${script}\n</html>`);
    }
    return html + script;
};
