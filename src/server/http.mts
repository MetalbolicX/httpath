import type { Config, FileEntry } from "../types.mts";
import { join } from "@std/path";
import { log, getMimeType, resolveSafePath } from "../utils";
import { generateDirectoryListingHTML, injectLiveReloadScript } from "../ui";
import { handleWebSocket } from "./websocket.mts";

const serveFile = async (
    filePath: string,
    config: Config,
): Promise<Response> => {
    const file = await Deno.open(filePath, { read: true });
    const mimeType = getMimeType(filePath);

    if (config.enableLiveReload && mimeType.includes("text/html")) {
        const content = await file.readable.getReader().read();
        file.close();

        if (content.value) {
            const html = new TextDecoder().decode(content.value);
            const modifiedHtml = injectLiveReloadScript(html, config.port);

            return new Response(modifiedHtml, {
                headers: {
                    "content-type": mimeType,
                    "cache-control": "no-cache",
                },
            });
        }
    }

    return new Response(file.readable, {
        headers: {
            "content-type": mimeType,
            "cache-control": "no-cache",
        },
    });
};

const serveDirectory = async (
    dirPath: string,
    urlPath: string,
    config: Config,
): Promise<Response> => {
    const entries: FileEntry[] = (await Array.fromAsync(Deno.readDir(dirPath)))
        .filter(
            (entry) =>
                !config.ignorePatterns.some((pattern) =>
                    entry.name.includes(pattern),
                ),
        )
        .map((entry) => ({
            name: entry.name,
            isDirectory: entry.isDirectory,
            url:
                urlPath === "/" ? `/${entry.name}` : `${urlPath}/${entry.name}`,
        }));

    let html = generateDirectoryListingHTML(entries, urlPath);

    if (config.enableLiveReload) {
        html = injectLiveReloadScript(html, config.port);
    }

    return new Response(html, {
        headers: { "content-type": "text/html; charset=utf-8" },
    });
};

export const createRequestHandler =
    (config: Config) =>
    async (request: Request): Promise<Response> => {
        const url = new URL(request.url);
        const pathname = decodeURIComponent(url.pathname);

        log(`${request.method} ${pathname}`, "debug");

        if (
            config.enableLiveReload &&
            pathname === "/livereload" &&
            request.headers.get("upgrade") === "websocket"
        ) {
            return handleWebSocket(request);
        }

        const safePath = resolveSafePath(config.directory, pathname);
        if (!safePath) {
            log(`Forbidden access attempt: ${pathname}`, "error");
            return new Response("Forbidden", { status: 403 });
        }

        try {
            const fileInfo = await Deno.stat(safePath);

            if (fileInfo.isFile) {
                return await serveFile(safePath, config);
            } else if (fileInfo.isDirectory) {
                if (config.enableDirectoryListing) {
                    return await serveDirectory(safePath, pathname, config);
                } else {
                    const indexPath = join(safePath, "index.html");
                    try {
                        await Deno.stat(indexPath);
                        return await serveFile(indexPath, config);
                    } catch {
                        return new Response("Directory listing disabled", {
                            status: 403,
                        });
                    }
                }
            }
        } catch (error) {
            if (error instanceof Deno.errors.NotFound) {
                log(`File not found: ${pathname}`, "error");
                return new Response("Not Found", { status: 404 });
            }
            log(`Server error: ${(error as Error).message}`, "error");
            return new Response("Internal Server Error", { status: 500 });
        }

        return new Response("Bad Request", { status: 400 });
    };

export const startHttpServer = async (
    config: Config,
    abortController: AbortController,
): Promise<void> => {
    const handler = createRequestHandler(config);

    log(`Starting server on http://localhost:${config.port}`);
    log(`Serving directory: ${config.directory}`);

    await Deno.serve({
        port: config.port,
        signal: abortController.signal,
        handler,
    }).finished;
};
