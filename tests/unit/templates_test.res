// templates_test.res — unit tests for Ui/Templates per REQ-TEMPLATES-1..3.

open Test

// ---------------------------------------------------------------------------
// REQ-TEMPLATES-1: escapeHtml — XSS prevention
// ---------------------------------------------------------------------------

test("Templates.escapeHtml: ampersand becomes &amp;", () => {
  let result = Templates.escapeHtml("a & b")
  assertion(~message="ampersand escaped", ~operator="=", (a, b) => a == b, result, "a &amp; b")
})

test("Templates.escapeHtml: less-than becomes &lt;", () => {
  let result = Templates.escapeHtml("<script>")
  assertion(~message="< escaped", ~operator="=", (a, b) => a == b, result, "&lt;script&gt;")
})

test("Templates.escapeHtml: greater-than becomes &gt;", () => {
  let result = Templates.escapeHtml("a > b")
  assertion(~message="> escaped", ~operator="=", (a, b) => a == b, result, "a &gt; b")
})

test("Templates.escapeHtml: double-quote becomes &quot;", () => {
  let result = Templates.escapeHtml("say \"hello\"")
  assertion(
    ~message="double-quote escaped",
    ~operator="=",
    (a, b) => a == b,
    result,
    "say &quot;hello&quot;",
  )
})

test("Templates.escapeHtml: single-quote (straight apostrophe) becomes &#39;", () => {
  // Use a straight apostrophe (U+0027) to test the escape
  let input = "it" ++ "'" ++ "s"
  let result = Templates.escapeHtml(input)
  assertion(~message="apostrophe escaped", ~operator="=", (a, b) => a == b, result, "it&#39;s")
})

test("Templates.escapeHtml: mixed XSS payload", () => {
  let result = Templates.escapeHtml("<script>alert('XSS')</script>")
  assertion(
    ~message="full XSS escaped",
    ~operator="=",
    (a, b) => a == b,
    result,
    "&lt;script&gt;alert(&#39;XSS&#39;)&lt;/script&gt;",
  )
})

test("Templates.escapeHtml: empty string is unchanged", () => {
  let result = Templates.escapeHtml("")
  assertion(~message="empty stays empty", ~operator="=", (a, b) => a == b, result, "")
})

test("Templates.escapeHtml: plain text is unchanged", () => {
  let result = Templates.escapeHtml("hello world 123")
  assertion(
    ~message="plain text unchanged",
    ~operator="=",
    (a, b) => a == b,
    result,
    "hello world 123",
  )
})

// ---------------------------------------------------------------------------
// REQ-TEMPLATES-2: type fileEntry = {name: string, isDirectory: bool, url: string}
// ---------------------------------------------------------------------------

test("Templates.fileEntry: can construct with name, isDirectory, url", () => {
  let entry: Templates.fileEntry = {
    name: "example.txt",
    isDirectory: false,
    url: "/example.txt",
  }
  assertion(~message="name field", ~operator="=", (a, b) => a == b, entry.name, "example.txt")
  assertion(~message="isDirectory false", ~operator="=", (a, b) => a == b, entry.isDirectory, false)
  assertion(~message="url field", ~operator="=", (a, b) => a == b, entry.url, "/example.txt")
})

// ---------------------------------------------------------------------------
// REQ-TEMPLATES-3: renderDirectoryListing
// ---------------------------------------------------------------------------

test("renderDirectoryListing: non-root shows parent link", () => {
  let entries: array<Templates.fileEntry> = []
  let html = Templates.renderDirectoryListing(~entries, ~urlPath="/subdir")
  // Should contain .. link
  assertion(
    ~message="contains .. link",
    ~operator="=",
    (a, b) => a == b,
    String.includes(html, "href=\"../\""),
    true,
  )
})

test("renderDirectoryListing: root hides parent link", () => {
  let entries: array<Templates.fileEntry> = []
  let html = Templates.renderDirectoryListing(~entries, ~urlPath="/")
  // Should NOT contain ../ href
  assertion(
    ~message="root has no parent link",
    ~operator="=",
    (a, b) => a == b,
    String.includes(html, "href=\"../\""),
    false,
  )
})

test("renderDirectoryListing: empty directory shows empty state", () => {
  let entries: array<Templates.fileEntry> = []
  let html = Templates.renderDirectoryListing(~entries, ~urlPath="/empty")
  assertion(
    ~message="contains empty state text",
    ~operator="=",
    (a, b) => a == b,
    String.includes(html, "This directory is empty"),
    true,
  )
})

test("renderDirectoryListing: directory emoji for folders", () => {
  let entries: array<Templates.fileEntry> = [
    {
      name: "mydir",
      isDirectory: true,
      url: "/mydir",
    },
  ]
  let html = Templates.renderDirectoryListing(~entries, ~urlPath="/")
  // The folder icon 📁 should appear
  assertion(
    ~message="contains folder emoji",
    ~operator="=",
    (a, b) => a == b,
    String.includes(html, "📁"),
    true,
  )
})

test("renderDirectoryListing: file emoji for files", () => {
  let entries: array<Templates.fileEntry> = [
    {
      name: "readme.txt",
      isDirectory: false,
      url: "/readme.txt",
    },
  ]
  let html = Templates.renderDirectoryListing(~entries, ~urlPath="/")
  // The file icon 📄 should appear
  assertion(
    ~message="contains file emoji",
    ~operator="=",
    (a, b) => a == b,
    String.includes(html, "📄"),
    true,
  )
})

test("renderDirectoryListing: directories sorted before files", () => {
  let entries: array<Templates.fileEntry> = [
    {name: "zebra.txt", isDirectory: false, url: "/zebra.txt"},
    {name: "alpha", isDirectory: true, url: "/alpha"},
    {name: "beta.txt", isDirectory: false, url: "/beta.txt"},
    {name: "gamma", isDirectory: true, url: "/gamma"},
  ]
  let html = Templates.renderDirectoryListing(~entries, ~urlPath="/")
  // Look for the unique anchor hrefs in order (dirs before files)
  let gammaAnchor = "<a href=\"/gamma\" class=\"file-item\">"
  let alphaAnchor = "<a href=\"/alpha\" class=\"file-item\">"
  let betaAnchor = "<a href=\"/beta.txt\" class=\"file-item\">"
  let gammaPos = String.indexOf(html, gammaAnchor)
  let alphaPos = String.indexOf(html, alphaAnchor)
  let betaPos = String.indexOf(html, betaAnchor)
  // Both dirs (gamma, alpha) should appear before beta.txt (files)
  // gamma (dir) position should be less than beta (file) position
  assertion(~message="gamma before beta", ~operator="=", (a, b) => a < b, gammaPos, betaPos)
  assertion(~message="alpha before beta", ~operator="=", (a, b) => a < b, alphaPos, betaPos)
})

test("renderDirectoryListing: alpha sorting within same type", () => {
  let entries: array<Templates.fileEntry> = [
    {name: "zebra.txt", isDirectory: false, url: "/zebra.txt"},
    {name: "alpha.txt", isDirectory: false, url: "/alpha.txt"},
    {name: "beta.txt", isDirectory: false, url: "/beta.txt"},
  ]
  let html = Templates.renderDirectoryListing(~entries, ~urlPath="/")
  // Look for the unique anchor hrefs in alphabetical order
  let alphaAnchor = "<a href=\"/alpha.txt\" class=\"file-item\">"
  let betaAnchor = "<a href=\"/beta.txt\" class=\"file-item\">"
  let zebraAnchor = "<a href=\"/zebra.txt\" class=\"file-item\">"
  let alphaPos = String.indexOf(html, alphaAnchor)
  let betaPos = String.indexOf(html, betaAnchor)
  let zebraPos = String.indexOf(html, zebraAnchor)
  assertion(~message="alpha before beta", ~operator="=", (a, b) => a < b, alphaPos, betaPos)
  assertion(~message="beta before zebra", ~operator="=", (a, b) => a < b, betaPos, zebraPos)
})

test("renderDirectoryListing: title contains Index of", () => {
  let entries: array<Templates.fileEntry> = []
  let html = Templates.renderDirectoryListing(~entries, ~urlPath="/documents")
  assertion(
    ~message="title has Index of",
    ~operator="=",
    (a, b) => a == b,
    String.includes(html, "<title>Index of /documents</title>"),
    true,
  )
})

test("renderDirectoryListing: urlPath is escaped in title", () => {
  let entries: array<Templates.fileEntry> = []
  let html = Templates.renderDirectoryListing(~entries, ~urlPath="/<script>")
  // The <script> in the path should be escaped in the output
  assertion(
    ~message="script tag escaped in title",
    ~operator="=",
    (a, b) => a == b,
    String.includes(html, "&lt;script&gt;"),
    true,
  )
})

test("renderDirectoryListing: file names are escaped", () => {
  let entries: array<Templates.fileEntry> = [
    {
      name: "<test>.txt",
      isDirectory: false,
      url: "/<test>.txt",
    },
  ]
  let html = Templates.renderDirectoryListing(~entries, ~urlPath="/")
  // The <test>.txt name should appear escaped
  assertion(
    ~message="filename escaped",
    ~operator="=",
    (a, b) => a == b,
    String.includes(html, "&lt;test&gt;"),
    true,
  )
})

test("renderDirectoryListing: non-root URL is used as href", () => {
  let entries: array<Templates.fileEntry> = [
    {
      name: "my file.txt",
      isDirectory: false,
      url: "/dir/my%20file.txt",
    },
  ]
  let html = Templates.renderDirectoryListing(~entries, ~urlPath="/dir")
  // The href should contain the url as-is
  assertion(
    ~message="href contains url",
    ~operator="=",
    (a, b) => a == b,
    String.includes(html, "href=\"/dir/my%20file.txt\""),
    true,
  )
})
