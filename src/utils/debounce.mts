let debounceTimeout: number | null = null;

/**
 * Creates a debounced promise that resolves after a specified delay.
 * If called multiple times before the delay completes, previous timeouts are cancelled
 * and the delay resets.
 *
 * @param ms - The debounce delay in milliseconds
 * @returns A promise that resolves after the debounce delay
 *
 * @example
 * ```typescript
 * await debounce(300);
 * console.log('300ms have passed');
 * ```
 */
export const debounce = (ms: number): Promise<void> =>
  new Promise((resolve) => {
    if (debounceTimeout !== null) {
      clearTimeout(debounceTimeout);
      debounceTimeout = null;
    }

    debounceTimeout = setTimeout(() => {
      debounceTimeout = null;
      resolve();
    }, ms);
  });
