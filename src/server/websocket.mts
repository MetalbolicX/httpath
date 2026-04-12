import { log } from "../utils/index.ts";

export const liveReloadClients = new Set<WebSocket>();

/**
 * Handles WebSocket upgrade requests and manages live reload client connections.
 *
 * @param request - The HTTP request object to upgrade to a WebSocket connection
 * @returns A Response object containing the upgraded WebSocket connection
 *
 * @description
 * Upgrades an HTTP request to a WebSocket connection and sets up event handlers for:
 * - `onopen`: Adds the client to the live reload clients set and logs the connection
 * - `onclose`: Removes the client from the set and logs the disconnection
 * - `onerror`: Removes the client from the set and logs the error
 *
 * @example
 * ```typescript
 * const request = new Request('ws://localhost:8000/ws');
 * const response = handleWebSocket(request);
 * ```
 */
export const handleWebSocket = (request: Request): Response => {
  const { socket, response } = Deno.upgradeWebSocket(request);

  socket.onopen = () => {
    liveReloadClients.add(socket);
    log(
      `Live reload client connected. Total clients: ${liveReloadClients.size}`,
      "debug",
    );
  };

  socket.onclose = () => {
    liveReloadClients.delete(socket);
    log(
      `Live reload client disconnected. Total clients: ${liveReloadClients.size}`,
      "debug",
    );
  };

  socket.onerror = () => {
    liveReloadClients.delete(socket);
    log(
      `Live reload client error. Total clients: ${liveReloadClients.size}`,
      "debug",
    );
  };

  return response;
};

/**
 * Notifies all connected live reload clients to reload their content.
 * 
 * Iterates through all active WebSocket clients and sends a reload signal to those
 * with an open connection. Automatically removes stale client connections that are
 * no longer in an OPEN state or fail to receive the signal.
 * 
 * @param reason - Optional description of why the reload was triggered (default: "file change")
 * 
 * @example
 * ```ts
 * notifyLiveReloadClients("config update");
 * notifyLiveReloadClients(); // Uses default reason
 * ```
 * 
 * @remarks
 * - Logs debug messages for no connected clients and stale connections
 * - Logs info level message showing number of successful notifications
 * - Gracefully handles errors when sending to individual clients
 */
export const notifyLiveReloadClients = (reason = "file change"): void => {
  if (liveReloadClients.size === 0) {
    log(`No live reload clients connected`, "debug");
    return;
  }

  let successCount = 0;
  let clientsToRemove: WebSocket[] = [];

  for (const client of liveReloadClients) {
    try {
      if (client.readyState === WebSocket.OPEN) {
        client.send("reload");
        successCount++;
      } else {
        clientsToRemove = [...clientsToRemove, client];
      }
    } catch (error) {
      clientsToRemove = [...clientsToRemove, client];
      log(`Failed to send reload signal to client: ${error}`, "debug");
    }
  }

  clientsToRemove.forEach((client) => liveReloadClients.delete(client));

  log(`Sent reload signal to ${successCount} clients (${reason})`, "info");
  if (clientsToRemove.length > 0) {
    log(
      `Removed ${clientsToRemove.length} stale client connections`,
      "debug",
    );
  }
};
