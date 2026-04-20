import { LIVE_RELOAD_ENDPOINT, LIVE_RELOAD_MESSAGE } from "../types.mts";

/**
 * Generates a live reload script that establishes a WebSocket connection to the development server.
 *
 * The script automatically detects the protocol (ws/wss) based on the current page's protocol,
 * connects to the live reload endpoint, and reloads the page when a reload message is received.
 * It includes automatic reconnection logic with a 1-second delay on connection errors or closures.
 *
 * @param port - The port number where the live reload WebSocket server is listening
 * @returns A string containing the complete live reload script wrapped in HTML script tags
 *
 * @example
 * ```typescript
 * const script = getLiveReloadScript(5173);
 * // Returns: <script>(() => { ... })();</script>
 * ```
 */
export const getLiveReloadScript = (port: number): string => /*html*/ `
<script>
(() => {
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  const clientPort = window.location.port || '${port}';
  const wsUrl = protocol + '//' + window.location.hostname + ':' + clientPort + '${LIVE_RELOAD_ENDPOINT}';

  const connect = () => {
    const ws = new WebSocket(wsUrl);

    ws.onopen = () => console.log('[Live Reload] Connected');

    ws.onmessage = (event) => {
      if (event.data === '${LIVE_RELOAD_MESSAGE}') {
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
 * Injects a live reload script into an HTML string.
 *
 * Attempts to insert the live reload script before the closing `</body>` tag if present,
 * otherwise before the closing `</html>` tag, or appends it to the end of the HTML string
 * if neither tag is found.
 *
 * @param html - The HTML string to inject the script into
 * @param port - The port number to be used by the live reload script
 * @returns The modified HTML string with the live reload script injected
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
