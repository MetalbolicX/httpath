let debounceTimeout: number | null = null;

/**
 * Debounces a function call.
 * @param ms - The debounce duration in milliseconds.
 * @returns A promise that resolves after the debounce duration.
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
