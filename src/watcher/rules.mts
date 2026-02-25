/**
 * This function checks if an event should be ignored based on the provided ignore patterns.
 * @param event - The file system event to check.
 * @param ignorePatterns - The patterns to ignore.
 * @returns True if the event should be ignored, false otherwise.
 */
export const shouldIgnoreEvent = (
    event: Deno.FsEvent,
    ignorePatterns: string[],
): boolean =>
    event.paths.some((path) =>
        ignorePatterns.some(
            (pattern) => path.includes(pattern) || path.endsWith(pattern),
        ),
    );

/**
 * This function checks if a server should be restarted based on the provided file paths.
 * @param filePaths - The file paths to check.
 * @returns True if a server should be restarted, false otherwise.
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
        serverRestartPatterns.some((pattern) => pattern.test(path)),
    );
};

/**
 * This function checks if a browser should be reloaded based on the provided file paths.
 * @param filePaths - The file paths to check.
 * @returns True if a browser should be reloaded, false otherwise.
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
        browserReloadPatterns.some((pattern) => pattern.test(path)),
    );
};
