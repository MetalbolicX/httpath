/**
 * Determines whether a file system event should be ignored based on configured patterns.
 *
 * @param event - The file system event to evaluate
 * @param ignorePatterns - Array of string patterns to match against event paths
 * @returns `true` if any path in the event matches any ignore pattern, `false` otherwise
 *
 * @example
 * const event: Deno.FsEvent = { kind: 'access', paths: ['src/temp.log'] };
 * const patterns = ['*.log', 'node_modules'];
 * shouldIgnoreEvent(event, patterns); // Returns true if 'src/temp.log' ends with '.log'
 */
export const shouldIgnoreEvent = (
  event: Deno.FsEvent,
  ignorePatterns: string[],
): boolean =>
  event.paths.some((path) =>
    ignorePatterns.some(
      (pattern) => path.includes(pattern) || path.endsWith(pattern),
    )
  );

/**
 * Determines whether the server should restart based on the provided file paths.
 *
 * @param filePaths - An array of file paths to check against restart patterns
 * @returns `true` if any file path matches a server restart pattern; otherwise `false`
 *
 * @remarks
 * The following file types trigger a server restart:
 * - TypeScript files (`.ts`)
 * - JavaScript files (`.js`, `.mjs`)
 * - Configuration files (`.json`, `.toml`, `.yaml`, `.yml`)
 * - Deno configuration (`deno.json`, `deno.lock`)
 * - Node.js configuration (`package.json`)
 *
 * @example
 * ```typescript
 * shouldRestartServer(['src/index.ts']) // true
 * shouldRestartServer(['README.md']) // false
 * shouldRestartServer(['deno.json', 'styles.css']) // true
 * ```
 */
export const shouldRestartServer = (filePaths: string[]): boolean => {
  const serverRestartPatterns = [
    /\.ts$/,
    /\.js$/,
    /\.mjs$/,
    /\.json$/,
    /\.toml$/,
    /\.yaml$/,
    /\.yml$/,
    /deno\.json/,
    /deno\.lock/,
    /package\.json/,
  ];

  return filePaths.some((path) =>
    serverRestartPatterns.some((pattern) => pattern.test(path))
  );
};

/**
 * Determines whether a browser reload should be triggered based on the provided file paths.
 *
 * Checks if any of the given file paths match patterns for web assets that typically require
 * a browser refresh when modified, including HTML, stylesheets, scripts, images, fonts, and configuration files.
 *
 * @param filePaths - An array of file paths to check against browser reload patterns
 * @returns `true` if any file path matches a browser reload pattern; otherwise `false`
 *
 * @example
 * ```typescript
 * shouldTriggerBrowserReload(['src/index.html', 'src/main.js'])
 * // Returns: true
 *
 * shouldTriggerBrowserReload(['src/config.yml'])
 * // Returns: false
 * ```
 */
export const shouldTriggerBrowserReload = (filePaths: string[]): boolean => {
  const browserReloadPatterns = [
    /\.html?$/,
    /\.css$/,
    /\.s[ac]ss$/,
    /\.less$/,
    /\.js$/,
    /\.jsx$/,
    /\.ts$/,
    /\.tsx$/,
    /\.vue$/,
    /\.svelte$/,
    /\.md$/,
    /\.(png|jpe?g|gif|svg|webp|ico)$/,
    /\.(woff2?|ttf|eot)$/,
    /\.json$/,
  ];

  return filePaths.some((path) =>
    browserReloadPatterns.some((pattern) => pattern.test(path))
  );
};
