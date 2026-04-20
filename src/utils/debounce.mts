type TimeoutHandle = ReturnType<typeof setTimeout>;

/**
 * Creates an isolated debouncer instance.
 *
 * All pending calls made to the returned function resolve together when the
 * most recent timer fires.
 */
export const createDebouncer = (): (ms: number) => Promise<void> => {
  let debounceTimeout: TimeoutHandle | null = null;
  let pendingResolvers: Array<() => void> = [];

  return (ms: number): Promise<void> =>
    new Promise((resolve) => {
      pendingResolvers.push(resolve);

      if (debounceTimeout !== null) {
        clearTimeout(debounceTimeout);
      }

      debounceTimeout = setTimeout(() => {
        const resolvers = pendingResolvers;
        pendingResolvers = [];
        debounceTimeout = null;

        for (const pendingResolve of resolvers) {
          pendingResolve();
        }
      }, ms);
    });
};

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
export const debounce = createDebouncer();
