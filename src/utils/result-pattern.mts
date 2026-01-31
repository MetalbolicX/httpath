// Result pattern utility for functional error handling
// Replaces try-catch blocks with explicit success/failure types

/**
 * Success result type
 */
export interface Success<T> {
  readonly success: true;
  readonly data: T;
  readonly error?: never;
}

/**
 * Failure result type
 */
export interface Failure<E = Error> {
  readonly success: false;
  readonly data?: never;
  readonly error: E;
}

/**
 * Result type - either Success or Failure
 */
export type Result<T, E = Error> = Success<T> | Failure<E>;

/**
 * Create a success result
 */
export const success = <T,>(data: T): Success<T> => ({
  success: true,
  data,
});

/**
 * Create a failure result
 */
export const failure = <E = Error,>(error: E): Failure<E> => ({
  success: false,
  error,
});

/**
 * Type guard to check if result is success
 */
export const isSuccess = <T, E>(result: Result<T, E>): result is Success<T> =>
  result.success === true;

/**
 * Type guard to check if result is failure
 */
export const isFailure = <T, E>(result: Result<T, E>): result is Failure<E> =>
  result.success === false;

/**
 * Wrap a synchronous function that might throw
 */
export const tryCatch = <T, E = Error>(
  fn: () => T,
  errorMapper?: (error: unknown) => E,
): Result<T, E> => {
  try {
    const data = fn();
    return success(data);
  } catch (error) {
    const mappedError = errorMapper ? errorMapper(error) : (error as E);
    return failure(mappedError);
  }
};

/**
 * Wrap an asynchronous function that might throw
 */
export const tryCatchAsync = async <T, E = Error>(
  fn: () => Promise<T>,
  errorMapper?: (error: unknown) => E,
): Promise<Result<T, E>> => {
  try {
    const data = await fn();
    return success(data);
  } catch (error) {
    const mappedError = errorMapper ? errorMapper(error) : (error as E);
    return failure(mappedError);
  }
};

/**
 * Map over the success value of a Result
 */
export const map = <T, U, E>(
  result: Result<T, E>,
  mapper: (value: T) => U,
): Result<U, E> => {
  if (isSuccess(result)) {
    return success(mapper(result.data));
  }
  return result;
};

/**
 * Map over the success value of a Result with an async mapper
 */
export const mapAsync = async <T, U, E>(
  result: Result<T, E>,
  mapper: (value: T) => Promise<U>,
): Promise<Result<U, E>> => {
  if (isSuccess(result)) {
    try {
      const mappedData = await mapper(result.data);
      return success(mappedData);
    } catch (error) {
      return failure(error as E);
    }
  }
  return result;
};

/**
 * Map over the error value of a Result
 */
export const mapError = <T, E, F>(
  result: Result<T, E>,
  mapper: (error: E) => F,
): Result<T, F> => {
  if (isFailure(result)) {
    return failure(mapper(result.error));
  }
  return result;
};

/**
 * Chain Results together (flatMap)
 */
export const chain = <T, U, E>(
  result: Result<T, E>,
  mapper: (value: T) => Result<U, E>,
): Result<U, E> => {
  if (isSuccess(result)) {
    return mapper(result.data);
  }
  return result;
};

/**
 * Chain Results together with async mapper
 */
export const chainAsync = async <T, U, E>(
  result: Result<T, E>,
  mapper: (value: T) => Promise<Result<U, E>>,
): Promise<Result<U, E>> => {
  if (isSuccess(result)) {
    return await mapper(result.data);
  }
  return result;
};

/**
 * Match on a Result and return a value
 */
export const match = <T, U, E>(
  result: Result<T, E>,
  onSuccess: (value: T) => U,
  onFailure: (error: E) => U,
): U => {
  if (isSuccess(result)) {
    return onSuccess(result.data);
  }
  return onFailure(result.error);
};

/**
 * Match on a Result with async handlers
 */
export const matchAsync = async <T, U, E>(
  result: Result<T, E>,
  onSuccess: (value: T) => Promise<U>,
  onFailure: (error: E) => Promise<U>,
): Promise<U> => {
  if (isSuccess(result)) {
    return await onSuccess(result.data);
  }
  return await onFailure(result.error);
};

/**
 * Get the success value or throw the error
 */
export const unwrap = <T, E>(result: Result<T, E>): T => {
  if (isSuccess(result)) {
    return result.data;
  }
  throw result.error;
};

/**
 * Get the success value or return a default
 */
export const unwrapOr = <T, E>(result: Result<T, E>, defaultValue: T): T => {
  if (isSuccess(result)) {
    return result.data;
  }
  return defaultValue;
};

/**
 * Get the success value or compute a default
 */
export const unwrapOrElse = <T, E>(
  result: Result<T, E>,
  getDefault: (error: E) => T,
): T => {
  if (isSuccess(result)) {
    return result.data;
  }
  return getDefault(result.error);
};

/**
 * Combine multiple Results into a single Result containing an array
 */
export const all = <T, E>(results: Result<T, E>[]): Result<T[], E> => {
  let values: T[] = [];

  for (const result of results) {
    if (isFailure(result)) {
      return result;
    }
    values = [...values, result.data];
  }

  return success(values);
};

/**
 * Combine multiple Results, collecting all errors
 */
export const allSettled = <T, E>(
  results: Result<T, E>[],
): {
  successes: T[];
  failures: E[];
} => {
  let successes: T[] = [];
  let failures: E[] = [];

  for (const result of results) {
    if (isSuccess(result)) {
      successes = [...successes, result.data];
    } else {
      failures = [...failures, result.error];
    }
  }

  return { successes, failures };
};

/**
 * Return the first successful result, or the last failure
 */
export const any = <T, E>(results: Result<T, E>[]): Result<T, E> => {
  let lastFailure: Failure<E> | null = null;

  for (const result of results) {
    if (isSuccess(result)) {
      return result;
    }
    lastFailure = result;
  }

  return lastFailure || failure("No results provided" as E);
};

/**
 * Filter successful results
 */
export const filterSuccess = <T, E>(results: Result<T, E>[]): T[] =>
  results.filter(isSuccess).map((result) => result.data);

/**
 * Filter failed results
 */
export const filterFailure = <T, E>(results: Result<T, E>[]): E[] =>
  results.filter(isFailure).map((result) => result.error);

/**
 * Partition results into successes and failures
 */
export const partition = <T, E>(
  results: Result<T, E>[],
): {
  successes: Success<T>[];
  failures: Failure<E>[];
} => {
  let successes: Success<T>[] = [];
  let failures: Failure<E>[] = [];

  for (const result of results) {
    if (isSuccess(result)) {
      successes = [...successes, result];
    } else {
      failures = [...failures, result];
    }
  }

  return { successes, failures };
};

/**
 * Convert a Promise that might reject into a Result
 */
export const fromPromise = async <T, E = Error>(
  promise: Promise<T>,
  errorMapper?: (error: unknown) => E,
): Promise<Result<T, E>> => {
  try {
    const data = await promise;
    return success(data);
  } catch (error) {
    const mappedError = errorMapper ? errorMapper(error) : (error as E);
    return failure(mappedError);
  }
};

/**
 * Convert a Result to a Promise (throws on failure)
 */
export const toPromise = <T, E>(result: Result<T, E>): Promise<T> => {
  if (isSuccess(result)) {
    return Promise.resolve(result.data);
  }
  return Promise.reject(result.error);
};

/**
 * Apply a function that returns a Result to each element
 */
export const traverse = <T, U, E>(
  items: T[],
  mapper: (item: T) => Result<U, E>,
): Result<U[], E> => {
  let results: U[] = [];

  for (const item of items) {
    const result = mapper(item);
    if (isFailure(result)) {
      return result;
    }
    results = [...results, result.data];
  }

  return success(results);
};

/**
 * Apply an async function that returns a Result to each element
 */
export const traverseAsync = async <T, U, E>(
  items: T[],
  mapper: (item: T) => Promise<Result<U, E>>,
): Promise<Result<U[], E>> => {
  let results: U[] = [];

  for (const item of items) {
    const result = await mapper(item);
    if (isFailure(result)) {
      return result;
    }
    results = [...results, result.data];
  }

  return success(results);
};

/**
 * Common error types for HTTPath
 */
export class HTTPathError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly statusCode?: number,
    public readonly path?: string,
  ) {
    super(message);
    this.name = "HTTPathError";
  }
}

/**
 * File system error
 */
export class FileSystemError extends HTTPathError {
  constructor(message: string, path?: string) {
    super(message, "FS_ERROR", 500, path);
    this.name = "FileSystemError";
  }
}

/**
 * Security error
 */
export class SecurityError extends HTTPathError {
  constructor(message: string, path?: string) {
    super(message, "SECURITY_ERROR", 403, path);
    this.name = "SecurityError";
  }
}

/**
 * Configuration error
 */
export class ConfigurationError extends HTTPathError {
  constructor(message: string) {
    super(message, "CONFIG_ERROR", 500);
    this.name = "ConfigurationError";
  }
}

/**
 * Network error
 */
export class NetworkError extends HTTPathError {
  constructor(message: string) {
    super(message, "NETWORK_ERROR", 500);
    this.name = "NetworkError";
  }
}

/**
 * Helper to create typed error mappers
 */
export const createErrorMapper = <E extends HTTPathError>(
  ErrorClass: new (message: string, ...args: any[]) => E,
) => {
  return (error: unknown, ...args: any[]): E => {
    if (error instanceof ErrorClass) {
      return error;
    }

    const message = error instanceof Error ? error.message : String(error);
    return new ErrorClass(message, ...args);
  };
};

// Pre-defined error mappers
export const mapToFileSystemError = createErrorMapper(FileSystemError);
export const mapToSecurityError = createErrorMapper(SecurityError);
export const mapToConfigurationError = createErrorMapper(ConfigurationError);
export const mapToNetworkError = createErrorMapper(NetworkError);
