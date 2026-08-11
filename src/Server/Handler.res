// Handler.res — static-file request handler pipeline.
// Faithful port of src/server/http.mts:256-490 per REQ-HANDLER-1..13.

module NodePath = Node_Path
module UHeaders = HttpHeaders
module Probes = Probes

// probes — initialized lazily inside make() once per handler instance.
// The draining ref is passed from Httpath via Handler.make.

// ---------------------------------------------------------------------------
// respond helper: wraps every response with security headers + logs
// ---------------------------------------------------------------------------

let respond = (
  ~status: int,
  ~headers: array<(string, string)>,
  ~body: Types.bodyContent,
  ~logLevel: Logger.logLevel,
  ~logMsg: string,
): Types.outcome => {
  let withSec = Headers.withSecurityHeaders(headers)
  Logger.log(logLevel, logMsg)
  Types.Respond({
    status,
    headers: withSec,
    body,
  })
}

// ---------------------------------------------------------------------------
// classify Fs error to 404 (ENOENT) or 500 (other)
// ---------------------------------------------------------------------------
// classifyFsError — maps Node.js fs errors to HTTP status codes.
// Promise.$$catch wraps JS errors as {RE_EXN_ID, _1} where _1 is the original.
// ---------------------------------------------------------------------------

type jsError = {code: option<string>, message: option<string>}
@get external unwrapExn: exn => jsError = "_1"
@get external innerErrorCode: jsError => option<string> = "code"
@get external innerErrorMessage: jsError => option<string> = "message"

let classifyFsError = (error: exn): int => {
  let inner = unwrapExn(error)
  let codeOpt = innerErrorCode(inner)
  switch codeOpt {
  | Some(code) if code == "ENOENT" => 404
  | Some(_) => 500
  | None => 500
  }
}

let errorMsg = (error: exn): string => {
  let inner = unwrapExn(error)
  switch innerErrorMessage(inner) {
  | Some(msg) => msg
  | None => "Unknown error"
  }
}

// ---------------------------------------------------------------------------
// serveFile: MIME + optional live-reload injection + SVG content-disposition
// ---------------------------------------------------------------------------

let serveFile = (~method: string, ~safePath: string, ~enableLiveReload: bool, ~port: int, ~tls: bool): promise<
  Types.outcome,
> => {
  let mime = Mime.fromPath(~path=safePath)
  let baseHeaders = [("content-type", mime.contentType), ("cache-control", "no-cache")]

  // HEAD returns Empty body
  if method == "HEAD" {
    let hdrs = tls ? Array.concat([Headers.hstsHeader], baseHeaders) : baseHeaders
    Promise.resolve(
      Types.Respond({
        status: 200,
        headers: Headers.withSecurityHeaders(hdrs),
        body: Types.Empty,
      }),
    )
  } else if enableLiveReload && mime.contentType == "text/html" {
    Fs.readTextFile(safePath)
    ->Promise.then(html => {
      let injected = Injector.injectLiveReloadScript(~html, ~port)
      let hdrs = tls ? Array.concat([Headers.hstsHeader], baseHeaders) : baseHeaders
      Promise.resolve(
        Types.Respond({
          status: 200,
          headers: Headers.withSecurityHeaders(hdrs),
          body: Types.Html(injected),
        }),
      )
    })
    ->Promise.catch(_error => {
      let hdrs = tls
        ? Array.concat([Headers.hstsHeader], [("content-type", "text/plain; charset=utf-8")])
        : [("content-type", "text/plain; charset=utf-8")]
      Promise.resolve(
        Types.Respond({
          status: 500,
          headers: Headers.withSecurityHeaders(hdrs),
          body: Types.Empty,
        }),
      )
    })
  } else {
    // Non-HTML or live reload disabled: stream file
    Fs.stat(safePath)
    ->Promise.then(statInfo => {
      let fileSize = Fs.statSize(statInfo)
      let contentLengthHeader = ("content-length", Int.toString(fileSize))
      let finalHeaders = if mime.contentType == "image/svg+xml" {
        let basename = NodePath.basename(safePath)
        let noQuotes = Js.String.replaceByRe(/"/g, "", basename)
        Array.concat(
          baseHeaders,
          [
            contentLengthHeader,
            ("content-disposition", "attachment; filename=\"" ++ noQuotes ++ "\""),
          ],
        )
      } else {
        Array.concat(baseHeaders, [contentLengthHeader])
      }
      let hdrs = tls ? Array.concat([Headers.hstsHeader], finalHeaders) : finalHeaders
      Promise.resolve(
        Types.Respond({
          status: 200,
          headers: Headers.withSecurityHeaders(hdrs),
          body: Types.File(safePath),
        }),
      )
    })
    ->Promise.catch(_error => {
      let code = classifyFsError(_error)
      Promise.resolve(
        respond(
          ~status=code,
          ~headers=[("content-type", "text/plain; charset=utf-8")],
          ~body=Types.Empty,
          ~logLevel=Logger.Error,
          ~logMsg=if code == 404 {
            "404 Not Found: " ++ safePath
          } else {
            "500 Internal Server Error reading: " ++ safePath
          },
        ),
      )
    })
  }
}

// ---------------------------------------------------------------------------
// serveDirectory: readdir → entries → render listing
// ---------------------------------------------------------------------------

let serveDirectory = (
  ~method: string,
  ~safePath: string,
  ~urlPath: string,
  ~enableLiveReload: bool,
  ~port: int,
  ~ignorePatterns: array<string>,
  ~tls: bool,
): promise<Types.outcome> => {
  // HEAD returns Empty body with content-type
  if method == "HEAD" {
    Promise.resolve(
      Types.Respond({
        status: 200,
        headers: Headers.withSecurityHeaders([("content-type", "text/html; charset=utf-8")]),
        body: Types.Empty,
      }),
    )
  } else {
    Fs.readdir(safePath)
    ->Promise.then(entries => {
      // Filter ignored entries
      let filtered = Array.filter(entries, entry => {
        let relPath = Fs.direntName(entry)
        let normalized = String.replaceRegExp(relPath, /\\/g, "/")
        !Path.matchesPattern(~path=normalized, ~patterns=ignorePatterns)
      })
      // Map to fileEntry
      // Normalize urlPath so requests like /assets/ don't produce /assets//file URLs.
      let basePath = if urlPath != "/" && Js.String.endsWith("/", urlPath) {
        Js.String.slice(~from=0, ~to_=String.length(urlPath) - 1, urlPath)
      } else {
        urlPath
      }
      let fileEntries: array<Templates.fileEntry> = Array.map(filtered, entry => {
        let entryUrl = if basePath == "/" {
          "/" ++ encodeURIComponent(Fs.direntName(entry))
        } else {
          basePath ++ "/" ++ encodeURIComponent(Fs.direntName(entry))
        }
        (
          {
            name: Fs.direntName(entry),
            isDirectory: Fs.direntIsDirectory(entry),
            url: entryUrl,
          }: Templates.fileEntry
        )
      })
      // Sort: dirs first, then localeCompare
      let sorted = {
        let arr = Array.copy(fileEntries)
        Array.sort(arr, (a, b) => {
          if a.isDirectory && !b.isDirectory {
            -1.0
          } else if !a.isDirectory && b.isDirectory {
            1.0
          } else {
            let cmp = String.localeCompare(a.name, b.name)
            if cmp < 0.0 {
              -1.0
            } else if cmp > 0.0 {
              1.0
            } else {
              0.0
            }
          }
        })
        arr
      }
      // Cap at 100
      let capped = Array.slice(sorted, ~start=0, ~end=100)
      let truncatedCount = Array.length(sorted) - Array.length(capped)
      // Render HTML
      let html = Templates.renderDirectoryListing(~entries=capped, ~urlPath)
      // Add truncation notice if needed
      let finalHtml = if truncatedCount > 0 {
        let notice = String.replace(
          html,
          "</main>",
          "<div class=\"empty-state\">Directory listing truncated after 100 entries (" ++
          Belt.Int.toString(truncatedCount) ++ " more not shown)</div></main>",
        )
        notice
      } else {
        html
      }
      // Inject live reload if enabled
      let withInjection = if enableLiveReload {
        Injector.injectLiveReloadScript(~html=finalHtml, ~port)
      } else {
        finalHtml
      }
      Promise.resolve(
        Types.Respond({
          status: 200,
          headers: Headers.withSecurityHeaders(
            ~cspOverride="default-src 'none'",
            tls
              ? [
                  ("content-type", "text/html; charset=utf-8"),
                  Headers.hstsHeader,
                ]
              : [("content-type", "text/html; charset=utf-8")],
          ),
          body: Types.Html(withInjection),
        }),
      )
    })
    ->Promise.catch(_error => {
      Promise.resolve(
        Types.Respond({
          status: 500,
          headers: Headers.withSecurityHeaders([("content-type", "text/plain; charset=utf-8")]),
          body: Types.Empty,
        }),
      )
    })
  }
}

// ---------------------------------------------------------------------------
// requestCtx — shared context passed through all sub-handlers.
// Keeps sub-handlers from reaching into module-level mutable state.
// ---------------------------------------------------------------------------

type requestCtx = {
  config: Config.t,
  probes: Probes.probeHandlers,
  request: Types.request,
  upperMethod: string,
}

// ---------------------------------------------------------------------------
// handle413 — reject requests with a non-zero content-length body.
// REQ-HANDLER-2
// ---------------------------------------------------------------------------

let handle413 = (ctx: requestCtx): option<promise<Types.outcome>> => {
  switch UHeaders.getContentLength(ctx.request.headers) {
  | Some(_) =>
    Some(
      Promise.resolve(
        respond(
          ~status=413,
          ~headers=[("content-type", "text/plain; charset=utf-8")],
          ~body=Types.Empty,
          ~logLevel=Logger.Error,
          ~logMsg="413 Payload Too Large: " ++ ctx.request.path,
        ),
      ),
    )
  | None => None
  }
}

// ---------------------------------------------------------------------------
// handle405 — reject non-GET/HEAD methods with 405 + Allow header.
// REQ-HANDLER-3
// ---------------------------------------------------------------------------

let handle405 = (ctx: requestCtx): option<promise<Types.outcome>> =>
  if ctx.upperMethod != "GET" && ctx.upperMethod != "HEAD" {
    Some(
      Promise.resolve(
        respond(
          ~status=405,
          ~headers=[("content-type", "text/plain; charset=utf-8"), ("allow", "GET, HEAD")],
          ~body=Types.Empty,
          ~logLevel=Logger.Info,
          ~logMsg="405 Method Not Allowed: " ++ ctx.upperMethod ++ " " ++ ctx.request.path,
        ),
      ),
    )
  } else {
    None
  }

// ---------------------------------------------------------------------------
// handleUriDecode — decode the URI path; 400 on invalid percent-encoding.
// REQ-HANDLER-4
// Returns Some(Promise) with 400 on failure, None to continue.
// ---------------------------------------------------------------------------

let _handleUriDecode = (ctx: requestCtx): option<promise<Types.outcome>> => {
  let decodedOr400: result<string, Types.outcome> = try {
    Ok(decodeURIComponent(ctx.request.path))
  } catch {
  | _ =>
    Error(
      respond(
        ~status=400,
        ~headers=[("content-type", "text/plain; charset=utf-8")],
        ~body=Types.Empty,
        ~logLevel=Logger.Error,
        ~logMsg="400 Bad Request: " ++ ctx.request.path,
      ),
    )
  }
  switch decodedOr400 {
  | Error(r) => Some(Promise.resolve(r))
  | Ok(_) => None
  }
}

// ---------------------------------------------------------------------------
// handleProbe — intercept /healthz, /readyz, and WS upgrade.
// Returns Some(outcome) if a probe path was matched, None to continue.
// ---------------------------------------------------------------------------

let handleProbe = (ctx: requestCtx, ~decodedPath: string): option<promise<Types.outcome>> => {
  if decodedPath == "/healthz" {
    Some(ctx.probes.healthz(ctx.request))
  } else if decodedPath == "/readyz" {
    Some(ctx.probes.readyz(ctx.request))
  } else if ctx.config.enableLiveReload &&
             decodedPath == Types.liveReloadEndpoint &&
             UHeaders.getUpgradeHeader(ctx.request.headers) == Some("websocket") {
    Some(Promise.resolve(Types.WsUpgrade))
  } else {
    None
  }
}

// ---------------------------------------------------------------------------
// handleSafePath — resolve the decoded path against the config directory.
// Returns Some(403) on traversal attempt, None to continue with safePath.
// REQ-HANDLER-6
// ---------------------------------------------------------------------------

let _handleSafePath = (ctx: requestCtx, ~decodedPath: string): option<(string, promise<Types.outcome>)> => {
  switch Path.resolveSafePath(~base=ctx.config.directory, ~requested=decodedPath) {
  | None =>
    Logger.log(Logger.Error, "403 Forbidden: path traversal blocked " ++ ctx.request.path)
    Some((
      "",
      Promise.resolve(
        respond(
          ~status=403,
          ~headers=[("content-type", "text/plain; charset=utf-8")],
          ~body=Types.Empty,
          ~logLevel=Logger.Error,
          ~logMsg="403 Forbidden: " ++ ctx.request.path,
        ),
      ),
    ))
  | Some(_safePath) => None
  }
}

// ---------------------------------------------------------------------------
// handleIgnorePattern — check whether the resolved path matches an ignore rule.
// Returns Some(403) if matched, None to continue.
// REQ-HANDLER-7
// ---------------------------------------------------------------------------

let handleIgnorePattern = (ctx: requestCtx, ~safePath: string): option<promise<Types.outcome>> => {
  let relPath = NodePath.relative(ctx.config.directory, safePath)
  let normalized = String.replaceRegExp(relPath, /\\/g, "/")
  if Path.matchesPattern(~path=normalized, ~patterns=ctx.config.ignorePatterns) {
    Logger.log(Logger.Debug, "403 Forbidden: ignored path " ++ ctx.request.path)
    Some(
      Promise.resolve(
        respond(
          ~status=403,
          ~headers=[("content-type", "text/plain; charset=utf-8")],
          ~body=Types.Empty,
          ~logLevel=Logger.Debug,
          ~logMsg="403 Forbidden (ignored): " ++ ctx.request.path,
        ),
      ),
    )
  } else {
    None
  }
}

// ---------------------------------------------------------------------------
// handleSymlinkCheck — verify no symlink appears in the resolved path.
// Returns Some(403) if a symlink is found, None to continue.
// REQ-HANDLER-8
// ---------------------------------------------------------------------------

let handleSymlinkCheck = (ctx: requestCtx, ~safePath: string): promise<option<Types.outcome>> => {
  Path.hasSymlinkPrefix(~base=ctx.config.directory, ~target=safePath)
  ->Promise.then(hasSymlink => {
    if hasSymlink {
      Logger.log(Logger.Error, "403 Forbidden: symlink in path " ++ ctx.request.path)
      Promise.resolve(
        Some(
          respond(
            ~status=403,
            ~headers=[("content-type", "text/plain; charset=utf-8")],
            ~body=Types.Empty,
            ~logLevel=Logger.Error,
            ~logMsg="403 Forbidden (symlink): " ++ ctx.request.path,
          ),
        ),
      )
    } else {
      Fs.lstat(safePath)
      ->Promise.then(lstatInfo => {
        if Fs.statIsSymlink(lstatInfo) {
          Logger.log(Logger.Error, "403 Forbidden: symlink target " ++ ctx.request.path)
          Promise.resolve(
            Some(
              respond(
                ~status=403,
                ~headers=[("content-type", "text/plain; charset=utf-8")],
                ~body=Types.Empty,
                ~logLevel=Logger.Error,
                ~logMsg="403 Forbidden (symlink target): " ++ ctx.request.path,
              ),
            ),
          )
        } else {
          Promise.resolve(None)
        }
      })
      ->Promise.catch(fsError => {
        // classifyFsError maps ENOENT -> 404, other -> 500.
        // Original (pre-035) behavior: missing lstat target -> 404, not 500.
        let code = classifyFsError(fsError)
        Promise.resolve(
          Some(
            respond(
              ~status=code,
              ~headers=[("content-type", "text/plain; charset=utf-8")],
              ~body=Types.Empty,
              ~logLevel=Logger.Error,
              ~logMsg=if code == 404 {
                "404 Not Found: " ++ ctx.request.path
              } else {
                "500 Internal Server Error: " ++ ctx.request.path
              },
            ),
          ),
        )
      })
    }
  })
  ->Promise.catch(_fsError => {
    // hasSymlinkPrefix already swallows ENOENT internally (returns false);
    // this catch is for genuine failures from Path.resolve etc. -> 500.
    Promise.resolve(
      Some(
        respond(
          ~status=500,
          ~headers=[("content-type", "text/plain; charset=utf-8")],
          ~body=Types.Empty,
          ~logLevel=Logger.Error,
          ~logMsg="500 Internal Server Error: symlink check failed " ++ ctx.request.path,
        ),
      ),
    )
  })
}

// ---------------------------------------------------------------------------
// handleFsError — classify a filesystem error as 404 or 500 and emit response.
// REQ-HANDLER-9
// ---------------------------------------------------------------------------

let handleFsError = (ctx: requestCtx, ~fsError: exn): promise<Types.outcome> => {
  let code = classifyFsError(fsError)
  if code == 404 {
    Logger.log(Logger.Error, "404 Not Found: " ++ ctx.request.path)
  } else {
    Logger.log(Logger.Error, "500 Internal Server Error: " ++ errorMsg(fsError))
  }
  Promise.resolve(
    respond(
      ~status=code,
      ~headers=[("content-type", "text/plain; charset=utf-8")],
      ~body=Types.Empty,
      ~logLevel=Logger.Error,
      ~logMsg=if code == 404 {
        "404 Not Found: " ++ ctx.request.path
      } else {
        "500 Internal Server Error: " ++ ctx.request.path
      },
    ),
  )
}

// ---------------------------------------------------------------------------
// handleNotFound — the resolved path exists but is neither a file nor a directory.
// REQ-HANDLER-9
// ---------------------------------------------------------------------------

let handleNotFound = (ctx: requestCtx): promise<Types.outcome> =>
  Promise.resolve(
    respond(
      ~status=404,
      ~headers=[("content-type", "text/plain; charset=utf-8")],
      ~body=Types.Empty,
      ~logLevel=Logger.Error,
      ~logMsg="404 Not Found: " ++ ctx.request.path,
    ),
  )

// ---------------------------------------------------------------------------
// handleServe — stat the safePath; dispatch to serveFile or serveDirectory.
// Owns the index.html fallback logic and all fs-error mapping.
// REQ-HANDLER-9
// ---------------------------------------------------------------------------

let handleServe = (ctx: requestCtx, ~safePath: string, ~decodedPath: string): promise<Types.outcome> =>
  Fs.stat(safePath)
  ->Promise.then(
    statInfo => {
      if Fs.statIsFile(statInfo) {
        // serveFile
        serveFile(
          ~method=ctx.upperMethod,
          ~safePath,
          ~enableLiveReload=ctx.config.enableLiveReload,
          ~port=ctx.config.port,
          ~tls=ctx.config.tls,
        )
      } else if Fs.statIsDirectory(statInfo) {
        if ctx.config.enableDirectoryListing {
          serveDirectory(
            ~method=ctx.upperMethod,
            ~safePath,
            ~urlPath=decodedPath,
            ~enableLiveReload=ctx.config.enableLiveReload,
            ~port=ctx.config.port,
            ~ignorePatterns=ctx.config.ignorePatterns,
            ~tls=ctx.config.tls,
          )
        } else {
          // Try index.html fallback
          let indexPath = NodePath.join(safePath, "index.html")
          Fs.lstat(indexPath)
          ->Promise.then(
            indexInfo => {
              if Fs.statIsSymlink(indexInfo) {
                Logger.log(
                  Logger.Error,
                  "403 Forbidden: index.html is symlink " ++ ctx.request.path,
                )
                Promise.resolve(
                  respond(
                    ~status=403,
                    ~headers=[("content-type", "text/plain; charset=utf-8")],
                    ~body=Types.Empty,
                    ~logLevel=Logger.Error,
                    ~logMsg="403 Forbidden (index symlink): " ++ ctx.request.path,
                  ),
                )
              } else {
                Fs.stat(indexPath)
                ->Promise.then(
                  _ => {
                    serveFile(
                      ~method=ctx.upperMethod,
                      ~safePath=indexPath,
                      ~enableLiveReload=ctx.config.enableLiveReload,
                      ~port=ctx.config.port,
                      ~tls=ctx.config.tls,
                    )
                  },
                )
                ->Promise.catch(
                  _ => {
                    Logger.log(
                      Logger.Debug,
                      "403 Directory listing disabled: " ++ ctx.request.path,
                    )
                    Promise.resolve(
                      respond(
                        ~status=403,
                        ~headers=[("content-type", "text/plain; charset=utf-8")],
                        ~body=Types.Empty,
                        ~logLevel=Logger.Debug,
                        ~logMsg="403 Directory listing disabled: " ++ ctx.request.path,
                      ),
                    )
                  },
                )
              }
            },
          )
          ->Promise.catch(
            _ => {
              Logger.log(
                Logger.Debug,
                "403 Directory listing disabled: " ++ ctx.request.path,
              )
              Promise.resolve(
                respond(
                  ~status=403,
                  ~headers=[("content-type", "text/plain; charset=utf-8")],
                  ~body=Types.Empty,
                  ~logLevel=Logger.Debug,
                  ~logMsg="403 Directory listing disabled: " ++ ctx.request.path,
                ),
              )
            },
          )
        }
      } else {
        handleNotFound(ctx)
      }
    },
  )
  ->Promise.catch(fsError => handleFsError(ctx, ~fsError))

// ---------------------------------------------------------------------------
// handle: the main handler pipeline dispatcher (~40 lines)
// Orchestrates the sub-handlers in specification order.
// REQ-HANDLER-2..13
// ---------------------------------------------------------------------------

let handle = (
  ~probes: Probes.probeHandlers,
  ~config: Config.t,
  ~request: Types.request,
): promise<Types.outcome> => {
  let upperMethod = String.toUpperCase(request.method)
  let ctx: requestCtx = {config, probes, request, upperMethod}

  // 413 — content-length check
  switch handle413(ctx) {
  | Some(r) => r
  | None =>
    // 405 — method check
    switch handle405(ctx) {
    | Some(r) => r
    | None =>
      // URI decode — build decodedPath for downstream use
      let decodedPathOr400: result<string, promise<Types.outcome>> = try {
        Ok(decodeURIComponent(request.path))
      } catch {
      | _ =>
        Error(
          Promise.resolve(
            respond(
              ~status=400,
              ~headers=[("content-type", "text/plain; charset=utf-8")],
              ~body=Types.Empty,
              ~logLevel=Logger.Error,
              ~logMsg="400 Bad Request: " ++ request.path,
            ),
          ),
        )
      }
      switch decodedPathOr400 {
      | Error(r) => r
      | Ok(decodedPath) =>
        // Probe intercept — /healthz, /readyz, WS upgrade
        switch handleProbe(ctx, ~decodedPath) {
        | Some(r) => r
        | None =>
          // Safe-path resolution
          switch Path.resolveSafePath(~base=config.directory, ~requested=decodedPath) {
          | None =>
            // Traversal blocked
            Promise.resolve(
              respond(
                ~status=403,
                ~headers=[("content-type", "text/plain; charset=utf-8")],
                ~body=Types.Empty,
                ~logLevel=Logger.Error,
                ~logMsg="403 Forbidden: " ++ request.path,
              ),
            )
          | Some(safePath) =>
            // Ignore-pattern check
            switch handleIgnorePattern(ctx, ~safePath) {
            | Some(r) => r
            | None =>
              // Symlink check
              handleSymlinkCheck(ctx, ~safePath)
              ->Promise.then(
                symlinkResult =>
                  switch symlinkResult {
                  | Some(r) => Promise.resolve(r)
                  | None => handleServe(ctx, ~safePath, ~decodedPath)
                  },
              )
            }
          }
        }
      }
    }
  }
}

// ---------------------------------------------------------------------------
// make: Config.t => {handler: Http.handlerCb, drain: ref<bool>}
// REQ-HANDLER-1
//
// `drain` is a ref<bool> read by /readyz and set true on SIGTERM by start().
// Returning it lets start() share ownership of the ref with the Handler.
// ---------------------------------------------------------------------------

type t = {handler: Http.handlerCb, drain: ref<bool>}

let make = (config: Config.t): t => {
  let drain = ref(false)
  let probes = Probes.make(~draining=drain)
  let handler = (req: Types.request) => handle(~probes, ~config, ~request=req)
  {handler, drain}
}
