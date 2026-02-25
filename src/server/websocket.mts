import { log } from "../utils";

export const liveReloadClients = new Set<WebSocket>();

/**
 * Handles WebSocket connections for live reloading.
 * @param request - The incoming WebSocket request.
 * @returns A response indicating the status of the WebSocket connection.
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
