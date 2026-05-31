export interface NetworkInterface {
  address: string;
  name: string;
}

/**
 * Returns all local IPv4 addresses (non-loopback) across all network interfaces.
 * Used to display LAN access URLs when the server binds to a non-localhost address.
 *
 * @returns Array of { address, name } objects for each detected LAN interface.
 *          Returns empty array if Deno.networkInterfaces() fails or no valid IPs found.
 *
 * @example
 * const ips = getLocalIPs();
 * // [{ address: "192.168.1.42", name: "eth0" }, { address: "10.0.0.5", name: "wlan0" }]
 */
export const getLocalIPs = (): NetworkInterface[] => {
  try {
    const interfaces = Deno.networkInterfaces();

    const result: NetworkInterface[] = [];

    for (const iface of interfaces) {
      // Skip non-IPv4 and loopback addresses (127.x.x.x)
      if (iface.family === "IPv4" && !iface.address.startsWith("127.")) {
        result.push({ address: iface.address, name: iface.name });
      }
    }

    return result;
  } catch {
    // If network interfaces can't be determined, return empty array
    // The server will still start normally without LAN URL display
    return [];
  }
};
