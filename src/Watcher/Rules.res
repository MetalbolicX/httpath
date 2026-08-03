// Rules.res — file-change classification for the watcher.
//
// Classifies a filename into a restart/reload/ignore action per REQ-FW-4.

type action =
  | Restart
  | BrowserReload
  | Ignore

let decide = (filename: string): action => {
  let lname = String.toLowerCase(filename)

  // Restart: config files (highest priority)
  if (
    String.includes(lname, "deno.json") ||
    String.includes(lname, "deno.lock") ||
    String.includes(lname, "package.json")
  ) {
    Restart
  } else if (
    String.includes(lname, ".ts") ||
    String.includes(lname, ".js") ||
    String.includes(lname, ".mjs") ||
    String.includes(lname, ".json") ||
    String.includes(lname, ".toml") ||
    String.includes(lname, ".yaml") ||
    String.includes(lname, ".yml")
  ) {
    Restart
  } else if (
    String.includes(lname, ".html") ||
    String.includes(lname, ".htm") ||
    String.includes(lname, ".css") ||
    String.includes(lname, ".scss") ||
    String.includes(lname, ".sass") ||
    String.includes(lname, ".less") ||
    String.includes(lname, ".jsx") ||
    String.includes(lname, ".tsx") ||
    String.includes(lname, ".vue") ||
    String.includes(lname, ".svelte") ||
    String.includes(lname, ".md") ||
    String.includes(lname, ".png") ||
    String.includes(lname, ".jpg") ||
    String.includes(lname, ".jpeg") ||
    String.includes(lname, ".gif") ||
    String.includes(lname, ".svg") ||
    String.includes(lname, ".webp") ||
    String.includes(lname, ".ico") ||
    String.includes(lname, ".woff") ||
    String.includes(lname, ".woff2") ||
    String.includes(lname, ".ttf") ||
    String.includes(lname, ".eot")
  ) {
    BrowserReload
  } else {
    Ignore
  }
}
