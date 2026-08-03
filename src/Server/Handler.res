// Handler.res — static-file request handler pipeline.
// Faithful port of src/server/http.mts:256-490 per REQ-HANDLER-1..13.

module NodePath = Node_Path

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
// content-length header lookup helper
// ---------------------------------------------------------------------------

let getContentLength = (headers: array<(string, string)>): option<int> => {
  let rec find = (i: int): option<int> => {
    if i >= Array.length(headers) {
      None
    } else {
      switch Array.get(headers, i) {
      | Some(("content-length", v)) => {
          let parsed = Belt.Int.fromString(v)
          switch parsed {
          | Some(n) => if n > 0 { Some(n) } else { None }
          | None => None
          }
        }
      | _ => find(i + 1)
      }
    }
  }
  find(0)
}

// ---------------------------------------------------------------------------
// upgrade header lookup helper
// ---------------------------------------------------------------------------

let getUpgradeHeader = (headers: array<(string, string)>): option<string> => {
  let rec find = (i: int): option<string> => {
    if i >= Array.length(headers) {
      None
    } else {
      switch Array.get(headers, i) {
      | Some(("upgrade", v)) => Some(v)
      | _ => find(i + 1)
      }
    }
  }
  find(0)
}

// ---------------------------------------------------------------------------
// classify Fs error to 404 (ENOENT) or 500 (other)
// ---------------------------------------------------------------------------
// classifyFsError — maps Node.js fs errors to HTTP status codes.
// Promise.$$catch wraps JS errors as {RE_EXN_ID, _1} where _1 is the original.
// ---------------------------------------------------------------------------

type jsError = { code: option<string>, message: option<string> }
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

let serveFile = (
  ~method: string,
  ~safePath: string,
  ~enableLiveReload: bool,
  ~port: int,
): promise<Types.outcome> => {
  let mime = Mime.fromPath(~path=safePath)
  let baseHeaders = [
    ("content-type", mime.contentType),
    ("cache-control", "no-cache"),
  ]
  // HEAD returns Empty body
  if method == "HEAD" {
    Promise.resolve(Types.Respond({
      status: 200,
      headers: Headers.withSecurityHeaders(baseHeaders),
      body: Types.Empty,
    }))
  } else if enableLiveReload && mime.contentType == "text/html" {
    Fs.readTextFile(safePath)->Promise.then(html => {
      let injected = Injector.injectLiveReloadScript(~html, ~port)
      Promise.resolve(Types.Respond({
        status: 200,
        headers: Headers.withSecurityHeaders(baseHeaders),
        body: Types.Html(injected),
      }))
    })->Promise.catch(_error => {
      Promise.resolve(Types.Respond({
        status: 500,
        headers: Headers.withSecurityHeaders([("content-type", "text/plain; charset=utf-8")]),
        body: Types.Empty,
      }))
    })
  } else {
    // Non-HTML or live reload disabled: stream file
    Fs.stat(safePath)->Promise.then(statInfo => {
      let fileSize = Fs.statSize(statInfo)
      let contentLengthHeader = ("content-length", Js.Int.toString(fileSize))
      let finalHeaders = if mime.contentType == "image/svg+xml" {
        let basename = NodePath.basename(safePath)
        let noQuotes = Js.String.replaceByRe(%re("/\"/g"), basename, "")
        Array.concat(baseHeaders, [contentLengthHeader, ("content-disposition", "attachment; filename=\"" ++ noQuotes ++ "\"")])
      } else {
        Array.concat(baseHeaders, [contentLengthHeader])
      }
      Promise.resolve(Types.Respond({
        status: 200,
        headers: Headers.withSecurityHeaders(finalHeaders),
        body: Types.File(safePath),
      }))
    })->Promise.catch(_error => {
      let code = classifyFsError(_error)
      Promise.resolve(respond(
        ~status=code,
        ~headers=[("content-type", "text/plain; charset=utf-8")],
        ~body=Types.Empty,
        ~logLevel=Logger.Error,
        ~logMsg=(if code == 404 { "404 Not Found: " ++ safePath } else { "500 Internal Server Error reading: " ++ safePath }),
      ))
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
): promise<Types.outcome> => {
  // HEAD returns Empty body with content-type
  if method == "HEAD" {
    Promise.resolve(Types.Respond({
      status: 200,
      headers: Headers.withSecurityHeaders([("content-type", "text/html; charset=utf-8")]),
      body: Types.Empty,
    }))
  } else {
    Fs.readdir(safePath)->Promise.then(entries => {
      // Filter ignored entries
      let filtered = Array.filter(entries, entry => {
        let relPath = Fs.direntName(entry)
        let normalized = Js.String2.replaceByRe(relPath, %re("/\\/g"), "/")
        !Path.matchesPattern(~path=normalized, ~patterns=ignorePatterns)
      })
      // Map to fileEntry
      let fileEntries: array<Templates.fileEntry> = Array.map(filtered, entry => {
        let entryUrl = if urlPath == "/" {
          "/" ++ Js.Global.encodeURIComponent(Fs.direntName(entry))
        } else {
          urlPath ++ "/" ++ Js.Global.encodeURIComponent(Fs.direntName(entry))
        }
        ({
          name: Fs.direntName(entry),
          isDirectory: Fs.direntIsDirectory(entry),
          url: entryUrl,
        }: Templates.fileEntry)
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
            if cmp < 0.0 { -1.0 } else if cmp > 0.0 { 1.0 } else { 0.0 }
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
        let notice = Js.String2.replace(html, "</main>", "<div class=\"empty-state\">Directory listing truncated after 100 entries (" ++ Belt.Int.toString(truncatedCount) ++ " more not shown)</div></main>")
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
      Promise.resolve(Types.Respond({
        status: 200,
        headers: Headers.withSecurityHeaders([("content-type", "text/html; charset=utf-8")]),
        body: Types.Html(withInjection),
      }))
    })->Promise.catch(_error => {
      Promise.resolve(Types.Respond({
        status: 500,
        headers: Headers.withSecurityHeaders([("content-type", "text/plain; charset=utf-8")]),
        body: Types.Empty,
      }))
    })
  }
}

// ---------------------------------------------------------------------------
// handle: the main handler pipeline
// REQ-HANDLER-2..13
// ---------------------------------------------------------------------------

let handle = (config: Config.t, request: Types.request): promise<Types.outcome> => {
  // REQ-HANDLER-2: 413 — content-length > 0
  switch getContentLength(request.headers) {
  | Some(_) =>
    Promise.resolve(respond(
      ~status=413,
      ~headers=[("content-type", "text/plain; charset=utf-8")],
      ~body=Types.Empty,
      ~logLevel=Logger.Error,
      ~logMsg="413 Payload Too Large: " ++ request.path,
    ))
  | None =>
    // REQ-HANDLER-3: method check (GET/HEAD only)
    let upperMethod = Js.String2.toUpperCase(request.method)
    if upperMethod != "GET" && upperMethod != "HEAD" {
      Promise.resolve(respond(
        ~status=405,
        ~headers=[
          ("content-type", "text/plain; charset=utf-8"),
          ("allow", "GET, HEAD"),
        ],
        ~body=Types.Empty,
        ~logLevel=Logger.Info,
        ~logMsg="405 Method Not Allowed: " ++ upperMethod ++ " " ++ request.path,
      ))
    } else {
      // REQ-HANDLER-4: URI decode (400 on throw)
      let decodedOr400: result<string, Types.outcome> = try {
        Ok(Js.Global.decodeURIComponent(request.path))
      } catch {
      | _ =>
        Error(respond(
          ~status=400,
          ~headers=[("content-type", "text/plain; charset=utf-8")],
          ~body=Types.Empty,
          ~logLevel=Logger.Error,
          ~logMsg="400 Bad Request: " ++ request.path,
        ))
      }
      switch decodedOr400 {
      | Error(r) => Promise.resolve(r)
      | Ok(decodedPath) => {
          // REQ-HANDLER-5: WS upgrade on /livereload
          if config.enableLiveReload &&
             decodedPath == Types.liveReloadEndpoint &&
             getUpgradeHeader(request.headers) == Some("websocket") {
            // NO origin check per design Q3a
            Promise.resolve(Types.WsUpgrade)
          } else {
            // REQ-HANDLER-6: safe-path
            switch Path.resolveSafePath(~base=config.directory, ~requested=decodedPath) {
            | None =>
              Logger.log(Logger.Error, "403 Forbidden: path traversal blocked " ++ request.path)
              Promise.resolve(respond(
                ~status=403,
                ~headers=[("content-type", "text/plain; charset=utf-8")],
                ~body=Types.Empty,
                ~logLevel=Logger.Error,
                ~logMsg="403 Forbidden: " ++ request.path,
              ))
            | Some(safePath) => {
                // REQ-HANDLER-7: ignore pattern
                let relPath = NodePath.relative(config.directory, safePath)
                let normalized = Js.String2.replaceByRe(relPath, %re("/\\/g"), "/")
                if Path.matchesPattern(~path=normalized, ~patterns=config.ignorePatterns) {
                  Logger.log(Logger.Debug, "403 Forbidden: ignored path " ++ request.path)
                  Promise.resolve(respond(
                    ~status=403,
                    ~headers=[("content-type", "text/plain; charset=utf-8")],
                    ~body=Types.Empty,
                    ~logLevel=Logger.Debug,
                    ~logMsg="403 Forbidden (ignored): " ++ request.path,
                  ))
                } else {
                  // REQ-HANDLER-8: symlink check
                  Path.hasSymlinkPrefix(~base=config.directory, ~target=safePath)->Promise.then(hasSymlink => {
                    if hasSymlink {
                      Logger.log(Logger.Error, "403 Forbidden: symlink in path " ++ request.path)
                      Promise.resolve(respond(
                        ~status=403,
                        ~headers=[("content-type", "text/plain; charset=utf-8")],
                        ~body=Types.Empty,
                        ~logLevel=Logger.Error,
                        ~logMsg="403 Forbidden (symlink): " ++ request.path,
                      ))
                    } else {
                      // lstat on the target
                      Fs.lstat(safePath)->Promise.then(lstatInfo => {
                        if Fs.statIsSymlink(lstatInfo) {
                          Logger.log(Logger.Error, "403 Forbidden: symlink target " ++ request.path)
                          Promise.resolve(respond(
                            ~status=403,
                            ~headers=[("content-type", "text/plain; charset=utf-8")],
                            ~body=Types.Empty,
                            ~logLevel=Logger.Error,
                            ~logMsg="403 Forbidden (symlink target): " ++ request.path,
                          ))
                        } else {
                          // REQ-HANDLER-9: stat
                          Fs.stat(safePath)->Promise.then(statInfo => {
                            if Fs.statIsFile(statInfo) {
                              // serveFile
                              serveFile(
                                ~method=upperMethod,
                                ~safePath,
                                ~enableLiveReload=config.enableLiveReload,
                                ~port=config.port,
                              )
                            } else if Fs.statIsDirectory(statInfo) {
                              if config.enableDirectoryListing {
                                serveDirectory(
                                  ~method=upperMethod,
                                  ~safePath,
                                  ~urlPath=decodedPath,
                                  ~enableLiveReload=config.enableLiveReload,
                                  ~port=config.port,
                                  ~ignorePatterns=config.ignorePatterns,
                                )
                              } else {
                                // Try index.html fallback
                                let indexPath = NodePath.join(safePath, "index.html")
                                Fs.lstat(indexPath)->Promise.then(indexInfo => {
                                  if Fs.statIsSymlink(indexInfo) {
                                    Logger.log(Logger.Error, "403 Forbidden: index.html is symlink " ++ request.path)
                                    Promise.resolve(respond(
                                      ~status=403,
                                      ~headers=[("content-type", "text/plain; charset=utf-8")],
                                      ~body=Types.Empty,
                                      ~logLevel=Logger.Error,
                                      ~logMsg="403 Forbidden (index symlink): " ++ request.path,
                                    ))
                                  } else {
                                    Fs.stat(indexPath)->Promise.then(_ => {
                                      serveFile(
                                        ~method=upperMethod,
                                        ~safePath=indexPath,
                                        ~enableLiveReload=config.enableLiveReload,
                                        ~port=config.port,
                                      )
                                    })->Promise.catch(_ => {
                                      Logger.log(Logger.Debug, "403 Directory listing disabled: " ++ request.path)
                                      Promise.resolve(respond(
                                        ~status=403,
                                        ~headers=[("content-type", "text/plain; charset=utf-8")],
                                        ~body=Types.Empty,
                                        ~logLevel=Logger.Debug,
                                        ~logMsg="403 Directory listing disabled: " ++ request.path,
                                      ))
                                    })
                                  }
                                })->Promise.catch(_ => {
                                  Logger.log(Logger.Debug, "403 Directory listing disabled: " ++ request.path)
                                  Promise.resolve(respond(
                                    ~status=403,
                                    ~headers=[("content-type", "text/plain; charset=utf-8")],
                                    ~body=Types.Empty,
                                    ~logLevel=Logger.Debug,
                                    ~logMsg="403 Directory listing disabled: " ++ request.path,
                                  ))
                                })
                              }
                            } else {
                              // Not a file or directory
                              Promise.resolve(respond(
                                ~status=404,
                                ~headers=[("content-type", "text/plain; charset=utf-8")],
                                ~body=Types.Empty,
                                ~logLevel=Logger.Error,
                                ~logMsg="404 Not Found: " ++ request.path,
                              ))
                            }
                            })->Promise.catch(fsError => {
                              let code = classifyFsError(fsError)
                            if code == 404 {
                              Logger.log(Logger.Error, "404 Not Found: " ++ request.path)
                            } else {
                              Logger.log(Logger.Error, "500 Internal Server Error: " ++ errorMsg(fsError))
                            }
                            Promise.resolve(respond(
                              ~status=code,
                              ~headers=[("content-type", "text/plain; charset=utf-8")],
                              ~body=Types.Empty,
                              ~logLevel=Logger.Error,
                              ~logMsg=(if code == 404 { "404 Not Found: " ++ request.path } else { "500 Internal Server Error: " ++ request.path }),
                            ))
                          })
                        }
                      })->Promise.catch(fsError => {
                        let code = classifyFsError(fsError)
                        if code == 404 {
                          Logger.log(Logger.Error, "404 Not Found: " ++ request.path)
                        } else {
                           Logger.log(Logger.Error, "500 Internal Server Error: " ++ errorMsg(fsError))
                        }
                        Promise.resolve(respond(
                          ~status=code,
                          ~headers=[("content-type", "text/plain; charset=utf-8")],
                          ~body=Types.Empty,
                          ~logLevel=Logger.Error,
                          ~logMsg=(if code == 404 { "404 Not Found: " ++ request.path } else { "500 Internal Server Error: " ++ request.path }),
                        ))
                      })
                    }
                  })->Promise.catch(_fsError => {
                    Logger.log(Logger.Error, "500 Internal Server Error: symlink check failed " ++ request.path)
                    Promise.resolve(respond(
                      ~status=500,
                      ~headers=[("content-type", "text/plain; charset=utf-8")],
                      ~body=Types.Empty,
                      ~logLevel=Logger.Error,
                      ~logMsg="500 Internal Server Error: " ++ request.path,
                    ))
                  })
                }
              }
            }
          }
        }
      }
    }
  }
}

// ---------------------------------------------------------------------------
// make: Config.t => Http.handlerCb
// REQ-HANDLER-1
// ---------------------------------------------------------------------------

let make = (config: Config.t): Http.handlerCb => {
  let handler = (req: Types.request) => handle(config, req)
  handler
}
