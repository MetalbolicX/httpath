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
 * Module-level singleton debouncer instance.
 *
 * Convenience export for callers that need a single shared debounce channel.
 * Use {@link createDebouncer} when you need isolated, independent debounce channels.
 *
 * @example
 * ```typescript
 * await debounce(300);
 * console.log('300ms have passed since the last call');
 * ```
 */
export const debounce = createDebouncer();
