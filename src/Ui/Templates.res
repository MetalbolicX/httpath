// Templates.res — HTML directory listing with XSS-safe escaping per REQ-TEMPLATES-1..3.
// Faithful port of src/ui/templates.mts:21-288.

// ---------------------------------------------------------------------------
// REQ-TEMPLATES-2: fileEntry type
// ---------------------------------------------------------------------------

type fileEntry = {
  name: string,
  isDirectory: bool,
  url: string,
}

// ---------------------------------------------------------------------------
// REQ-TEMPLATES-1: escapeHtml — pure ReScript, zero %raw
// ---------------------------------------------------------------------------

let escapeHtml = (input: string): string => {
  let len = String.length(input)
  let rec build = (i: int, acc: string): string => {
    if i >= len {
      acc
    } else {
      // Js.String.substring(~from, ~to_, string) — labeled args avoid position bugs
      let c = Js.String.substring(input, ~from=i, ~to_=i + 1)
      let esc = switch c {
      | "&" => "&amp;"
      | "<" => "&lt;"
      | ">" => "&gt;"
      | "\"" => "&quot;"
      | "'" => "&#39;"
      | _ => c
      }
      build(i + 1, acc ++ esc)
    }
  }
  build(0, "")
}

// ---------------------------------------------------------------------------
// CSS styles (faithful to getCSSStyles from templates.mts:29-198)
// ---------------------------------------------------------------------------

let cssStyles = ":root { --bg-body: #f8fafc; --bg-surface: #ffffff; --text-main: #0f172a; --text-muted: #64748b; --border-color: #e2e8f0; --hover-bg: #f1f5f9; --accent-color: #3b82f6; --toggle-bg: #cbd5e1; --toggle-knob: #ffffff; --shadow-sm: 0 1px 2px 0 rgb(0 0 0 / 0.05); --shadow-md: 0 4px 6px -1px rgb(0 0 0 / 0.1), 0 2px 4px -2px rgb(0 0 0 / 0.1); } :root:has(#dark:checked) { --bg-body: #0f172a; --bg-surface: #1e293b; --text-main: #f8fafc; --text-muted: #94a3b8; --border-color: #334155; --hover-bg: #334155; --accent-color: #60a5fa; --toggle-bg: #3b82f6; --toggle-knob: #ffffff; --shadow-sm: 0 1px 2px 0 rgb(0 0 0 / 0.3); --shadow-md: 0 4px 6px -1px rgb(0 0 0 / 0.3), 0 2px 4px -2px rgb(0 0 0 / 0.3); } * { box-sizing: border-box; margin: 0; padding: 0; } body { font-family: system-ui, -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif; background-color: var(--bg-body); color: var(--text-main); line-height: 1.5; padding: 2rem 1rem; transition: background-color 0.3s ease, color 0.3s ease; } .container { max-width: 800px; margin: 0 auto; background-color: var(--bg-surface); border-radius: 12px; border: 1px solid var(--border-color); box-shadow: var(--shadow-md); overflow: hidden; transition: background-color 0.3s ease, border-color 0.3s ease; } .header { display: flex; align-items: center; justify-content: space-between; padding: 1.5rem 2rem; border-bottom: 1px solid var(--border-color); background-color: var(--bg-surface); } .header h1 { font-size: 1.25rem; font-weight: 600; color: var(--text-main); word-break: break-all; } .header-path { color: var(--text-muted); font-weight: 400; font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace; font-size: 1rem; margin-left: 0.5rem; } .toggle { --width: 46px; --height: 24px; display: flex; align-items: center; cursor: pointer; flex-shrink: 0; } .toggle__input { display: none; } .toggle__fill { position: relative; width: var(--width); height: var(--height); border-radius: 9999px; background-color: var(--toggle-bg); transition: background-color 0.3s ease; } .toggle__fill::after { content: \"\"; position: absolute; top: 2px; left: 2px; width: 20px; height: 20px; border-radius: 50%; background-color: var(--toggle-knob); box-shadow: var(--shadow-sm); transition: transform 0.3s cubic-bezier(0.4, 0, 0.2, 1); } .toggle__input:checked + .toggle__fill::after { transform: translateX(22px); } .file-list { display: flex; flex-direction: column; padding: 0.5rem; } .file-item { display: flex; align-items: center; padding: 0.75rem 1rem; text-decoration: none; color: var(--text-main); border-radius: 8px; transition: background-color 0.2s ease, color 0.2s ease; } .file-item:hover { background-color: var(--hover-bg); } .file-item:hover .file-name { color: var(--accent-color); } .icon { font-size: 1.25rem; margin-right: 1rem; display: flex; align-items: center; justify-content: center; width: 24px; } .file-name { font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace; font-size: 0.95rem; transition: color 0.2s ease; } .empty-state { padding: 3rem; text-align: center; color: var(--text-muted); font-style: italic; }"

// ---------------------------------------------------------------------------
// REQ-TEMPLATES-3: renderDirectoryListing
// ---------------------------------------------------------------------------

let renderDirectoryListing = (~entries: array<fileEntry>, ~urlPath: string): string => {
  // Parent directory link: only when not at root
  let parentDir = if urlPath == "/" {
    ""
  } else {
    "<a href=\"../\" class=\"file-item\"><span class=\"icon\">📁</span><span class=\"file-name\">..</span></a>"
  }

  // Sort: directories first, then alphabetical (localeCompare)
  // Array.sort mutates in-place and returns unit, so copy first
  let sorted = {
    let arr = Array.copy(entries)
    Array.sort(arr, (a, b) => {
      if a.isDirectory && !b.isDirectory {
        -1.0
      } else if !a.isDirectory && b.isDirectory {
        1.0
      } else {
        // String.localeCompare returns float — use float comparison
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

  // Build entry links
  let entryLinks = if Array.length(sorted) == 0 {
    "<div class=\"empty-state\">This directory is empty</div>"
  } else {
    Array.map(sorted, entry => {
      let icon = if entry.isDirectory {
        "📁"
      } else {
        "📄"
      }
      let href = entry.url
      "<a href=\"" ++
      href ++
      "\" class=\"file-item\"><span class=\"icon\">" ++
      icon ++
      "</span><span class=\"file-name\">" ++
      escapeHtml(entry.name) ++ "</span></a>"
    })->Array.join("")
  }

  // Dark mode toggle
  let themeToggle = "<label class=\"toggle\" for=\"dark\" title=\"Toggle Dark Mode\"><input type=\"checkbox\" name=\"toggle\" id=\"dark\" class=\"toggle__input\" checked><span class=\"toggle__fill\"></span></label>"

  // Assemble full HTML document
  "<!DOCTYPE html>\n<html lang=\"en\">\n<head>\n  <meta charset=\"utf-8\">\n  <meta name=\"viewport\" content=\"width=device-width, initial-scale=1.0\">\n  <title>Index of " ++
  escapeHtml(urlPath) ++
  "</title>\n  <style>\n" ++
  cssStyles ++
  "\n  </style>\n</head>\n<body>\n  <div class=\"container\">\n    <header class=\"header\">\n      <h1>Index of <span class=\"header-path\">" ++
  escapeHtml(urlPath) ++
  "</span></h1>\n      " ++
  themeToggle ++
  "\n    </header>\n    <main class=\"file-list\">\n      " ++
  parentDir ++
  "\n      " ++
  entryLinks ++ "\n    </main>\n  </div>\n</body>\n</html>"
}
