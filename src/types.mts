export interface Config {
    directory: string;
    port: number;
    ignorePatterns: string[];
    enableDirectoryListing: boolean;
    logLevel: "info" | "debug" | "error";
    enableLiveReload: boolean;
    restartOnChange: boolean;
}

export interface FileEntry {
    name: string;
    isDirectory: boolean;
    url: string;
}
