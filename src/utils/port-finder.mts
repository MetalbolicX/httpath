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
 * Check if a port is available
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
 * Find the next available port starting from a given port
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
 * Get port status information
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
 * Check multiple ports status
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
 * Find port in a specific range with custom logic
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

/**
 * Find port in a predefined range
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
 * Smart port finder that tries common development ports first
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
 * Port finder with retry logic
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
