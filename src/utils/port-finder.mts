// Port finder utility module
import { createServer } from "node:http";
import type { PortFinderOptions, Result } from "../types/index.mjs";
import {
  success,
  failure,
  mapToNetworkError,
  isSuccess,
} from "./result-pattern.mjs";

/**
 * Default port finder options
 */
export const DEFAULT_PORT_FINDER_OPTIONS: Required<PortFinderOptions> = {
  startPort: 8080,
  endPort: 8180,
  timeout: 2000,
};

/**
 * Check if a specific port is available
 * @param port - Port number to check
 * @param timeout - Timeout in milliseconds
 * @returns Promise resolving to Result<boolean> indicating if port is available
 * @description
 * This function attempts to create a temporary server on the specified port.
 * If the server starts successfully, the port is available. If an error occurs
 * indicating the address is in use, the port is not available. Other errors are
 * mapped to network errors.
 */
export const isPortAvailable = (
  port: number,
  timeout = 2000,
): Promise<Result<boolean>> => {
  return new Promise((resolve) => {
    const server = createServer();

    let isResolved = false;

    const timeoutId = setTimeout(() => {
      if (!isResolved) {
        isResolved = true;
        server.close();
        resolve(success(false));
      }
    }, timeout);

    server.once("error", (error: any) => {
      if (!isResolved) {
        isResolved = true;
        clearTimeout(timeoutId);
        server.close();
        if (error.code === "EADDRINUSE") {
          resolve(success(false));
        } else {
          resolve(failure(mapToNetworkError(error)));
        }
      }
    });

    server.once("listening", () => {
      if (!isResolved) {
        isResolved = true;
        clearTimeout(timeoutId);
        server.close(() => {
          resolve(success(true));
        });
      }
    });

    server.listen(port);
  });
};

/**
 * Find a single available port within a specified range
 * @param options - PortFinderOptions to specify range and timeout
 * @returns Promise resolving to Result<number> with the available port number or error
 * @description
 * This function iterates through the specified port range, checking each port's availability.
 * It returns the first available port found. If no ports are available in the range,
 * it returns an error indicating the failure.
 */
export const findAvailablePort = async (
  options: Partial<PortFinderOptions> = {},
): Promise<Result<number>> => {
  const opts = { ...DEFAULT_PORT_FINDER_OPTIONS, ...options };

  if (opts.startPort < 1 || opts.startPort > 65535) {
    return failure(
      mapToNetworkError(
        new Error(
          `Invalid start port: ${opts.startPort}. Must be between 1 and 65535.`,
        ),
      ),
    );
  }

  if (opts.endPort < opts.startPort || opts.endPort > 65535) {
    return failure(
      mapToNetworkError(
        new Error(
          `Invalid end port: ${opts.endPort}. Must be between ${opts.startPort} and 65535.`,
        ),
      ),
    );
  }

  for (let port = opts.startPort; port <= opts.endPort; port++) {
    const availabilityResult = await isPortAvailable(port, opts.timeout);
    if (isSuccess(availabilityResult) && availabilityResult.data) {
      return success(port);
    }
    // Continue to next port if it's not available or there's an error
  }

  return failure(
    mapToNetworkError(
      new Error(
        `No available ports found in range ${opts.startPort}-${opts.endPort}`,
      ),
    ),
  );
};

/**
 * Find multiple available ports
 * @param count - Number of ports to find
 * @param options - PortFinderOptions to specify range and timeout
 * @returns Promise resolving to Result<number[]> with the available port numbers or error
 * @description
 * This function searches for the specified number of available ports within the given range.
 * It returns an array of available port numbers. If it cannot find enough available ports,
 * it returns an error indicating how many ports were found versus requested.
 */
export const findAvailablePorts = async (
  count: number,
  options: Partial<PortFinderOptions> = {},
): Promise<Result<number[]>> => {
  const opts = { ...DEFAULT_PORT_FINDER_OPTIONS, ...options };
  const ports: number[] = [];

  if (count <= 0) {
    return failure(
      mapToNetworkError(new Error("Port count must be greater than 0")),
    );
  }

  let currentPort = opts.startPort;

  while (ports.length < count && currentPort <= opts.endPort) {
    const availabilityResult = await isPortAvailable(currentPort, opts.timeout);
    if (isSuccess(availabilityResult) && availabilityResult.data) {
      ports.push(currentPort);
    }
    currentPort++;
  }

  if (ports.length < count) {
    return failure(
      mapToNetworkError(
        new Error(
          `Only found ${ports.length} available ports, requested ${count}`,
        ),
      ),
    );
  }

  return success(ports);
};

/**
 * Get status of a specific port
 * @param port - Port number to check
 * @returns Promise resolving to Result with port status information or error
 * @description
 * This function checks the availability of a specific port and returns an object
 * containing the port number, its availability status, and any error message if applicable.
 */
export const getPortStatus = async (
  port: number,
): Promise<
  Result<{
    port: number;
    available: boolean;
    error?: string;
  }>
> => {
  const availabilityResult = await isPortAvailable(port);
  if (isSuccess(availabilityResult)) {
    return success({
      port,
      available: availabilityResult.data,
    });
  } else {
    return success({
      port,
      available: false,
      error: availabilityResult.error.message,
    });
  }
};

/**
 * Check status of multiple ports
 * @param ports - Array of port numbers to check
 * @returns Promise resolving to Result with array of port status information or error
 * @description
 * This function checks the availability of multiple ports and returns an array
 * of objects containing each port number, its availability status, and any error
 * message if applicable.
 */
export const checkPortsStatus = async (
  ports: number[],
): Promise<
  Result<Array<{ port: number; available: boolean; error?: string }>>
> => {
  const results = await Promise.allSettled(
    ports.map((port) => getPortStatus(port)),
  );

  const statuses = results.map((result, index) => {
    if (result.status === "fulfilled" && isSuccess(result.value)) {
      return result.value.data;
    } else {
      return {
        port: ports[index],
        available: false,
        error:
          result.reason instanceof Error
            ? result.reason.message
            : "Unknown error",
      };
    }
  });

  return success(statuses);
};

/**
 * Find a port in a given range that satisfies an optional predicate
 * @param startPort - Starting port number
 * @param endPort - Ending port number
 * @param predicate - Optional function to filter ports
 * @returns Promise resolving to Result<number | null> with the found port or null if none found
 * @description
 * This function iterates through the specified port range, applying an optional
 * predicate function to filter ports. It returns the first port that satisfies
 * the predicate and is available. If no such port is found, it returns null.
 */
export const findPortInRange = async (
  startPort: number,
  endPort: number,
  predicate?: (port: number) => boolean,
): Promise<Result<number | null>> => {
  if (startPort < 1 || startPort > 65535 || endPort < 1 || endPort > 65535) {
    return failure(
      mapToNetworkError(new Error("Port numbers must be between 1 and 65535")),
    );
  }

  if (startPort > endPort) {
    return failure(
      mapToNetworkError(
        new Error("Start port must be less than or equal to end port"),
      ),
    );
  }

  for (let port = startPort; port <= endPort; port++) {
    // Apply custom predicate if provided
    if (predicate && !predicate(port)) {
      continue;
    }

    const availabilityResult = await isPortAvailable(port);
    if (isSuccess(availabilityResult) && availabilityResult.data) {
      return success(port);
    }
    // Continue to next port if it's not available or there's an error
  }

  return success(null);
};

/**
 * Common port ranges
 */
export const PORT_RANGES = {
  SYSTEM: { start: 1, end: 1023 },
  REGISTERED: { start: 1024, end: 49151 },
  DYNAMIC: { start: 49152, end: 65535 },
  DEVELOPMENT: { start: 3000, end: 9999 },
  HTTP_ALT: { start: 8000, end: 8999 },
} as const;

/** Find a port in a predefined range
 * @param rangeName - Name of the predefined port range
 * @returns Promise resolving to Result<number> with the found port or error
 * @description
 * This function looks for an available port within a predefined range
 * such as SYSTEM, REGISTERED, DYNAMIC, DEVELOPMENT, or HTTP_ALT.
 * It returns the first available port found or an error if none are available.
 */
export const findPortInPredefinedRange = async (
  rangeName: keyof typeof PORT_RANGES,
): Promise<Result<number>> => {
  const range = PORT_RANGES[rangeName];
  const portResult = await findPortInRange(range.start, range.end);

  if (!isSuccess(portResult)) {
    return portResult;
  }

  if (portResult.data === null) {
    return failure(
      mapToNetworkError(
        new Error(
          `No available ports in ${rangeName} range (${range.start}-${range.end})`,
        ),
      ),
    );
  }

  return success(portResult.data);
};

/**
 * Find a smart port for development servers
 * @param preferredPort - Preferred port number to try first
 * @returns Promise resolving to the first available port number
 * @description
 * This function attempts to find an available port commonly used for development servers.
 * It first tries the preferred port, then a list of common development ports,
 * and finally falls back to a sequential search if necessary.
 */
export const findSmartPort = async (preferredPort = 8080): Promise<number> => {
  // Common development ports in order of preference
  const commonPorts = [
    preferredPort,
    3000,
    3001,
    3002,
    3003,
    8000,
    8001,
    8080,
    8081,
    8888,
    4000,
    4200,
    5000,
    5173,
    9000,
    9001,
  ].filter((port, index, arr) => arr.indexOf(port) === index); // Remove duplicates

  // Try common ports first
  for (const port of commonPorts) {
    try {
      const isAvailable = await isPortAvailable(port);
      if (isAvailable) {
        return port;
      }
    } catch (error) {
      continue;
    }
  }

  // Fall back to sequential search
  return await findAvailablePort({
    startPort: Math.max(...commonPorts) + 1,
    endPort: 9999,
  });
};

/**
 * Find port with retry mechanism
 * @param options - PortFinderOptions to specify range and timeout
 * @param maxRetries - Maximum number of retry attempts
 * @returns Promise resolving to Result<number> with the available port number or error
 * @description
 * This function attempts to find an available port within the specified range,
 * retrying the search up to the specified number of times if no port is found.
 * It implements an exponential backoff strategy between retries.
 */
export const findPortWithRetry = async (
  options: Partial<PortFinderOptions> = {},
  maxRetries = 3,
): Promise<Result<number>> => {
  let lastError: Error | null = null;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    const portResult = await findAvailablePort(options);
    if (isSuccess(portResult)) {
      return portResult;
    }

    lastError = portResult.error;

    if (attempt < maxRetries) {
      // Wait before retry with exponential backoff
      const delay = Math.min(1000 * Math.pow(2, attempt - 1), 5000);
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }

  return failure(
    mapToNetworkError(
      new Error(
        `Failed to find available port after ${maxRetries} attempts. Last error: ${lastError?.message}`,
      ),
    ),
  );
};
