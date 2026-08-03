// Rules.res — file-change classification for the watcher.
//
// Classifies a filename into a restart/reload/ignore action per REQ-FW-4.

type action =
  | Restart
  | BrowserReload
  | Ignore

let decide = (filename: string): action => {
  let lname = Js.String2.toLowerCase(filename)

  // Restart: config files (highest priority)
  if Js.String2.includes(lname, "deno.json") ||
     Js.String2.includes(lname, "deno.lock") ||
     Js.String2.includes(lname, "package.json") {
    Restart
  } else if Js.String2.includes(lname, ".ts") ||
            Js.String2.includes(lname, ".js") ||
            Js.String2.includes(lname, ".mjs") ||
            Js.String2.includes(lname, ".json") ||
            Js.String2.includes(lname, ".toml") ||
            Js.String2.includes(lname, ".yaml") ||
            Js.String2.includes(lname, ".yml") {
    Restart
  } else if Js.String2.includes(lname, ".html") ||
            Js.String2.includes(lname, ".htm") ||
            Js.String2.includes(lname, ".css") ||
            Js.String2.includes(lname, ".scss") ||
            Js.String2.includes(lname, ".sass") ||
            Js.String2.includes(lname, ".less") ||
            Js.String2.includes(lname, ".jsx") ||
            Js.String2.includes(lname, ".tsx") ||
            Js.String2.includes(lname, ".vue") ||
            Js.String2.includes(lname, ".svelte") ||
            Js.String2.includes(lname, ".md") ||
            Js.String2.includes(lname, ".png") ||
            Js.String2.includes(lname, ".jpg") ||
            Js.String2.includes(lname, ".jpeg") ||
            Js.String2.includes(lname, ".gif") ||
            Js.String2.includes(lname, ".svg") ||
            Js.String2.includes(lname, ".webp") ||
            Js.String2.includes(lname, ".ico") ||
            Js.String2.includes(lname, ".woff") ||
            Js.String2.includes(lname, ".woff2") ||
            Js.String2.includes(lname, ".ttf") ||
            Js.String2.includes(lname, ".eot") {
    BrowserReload
  } else {
    Ignore
  }
}
