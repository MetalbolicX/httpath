import {
  escapeHtml,
  generateDirectoryListingHTML,
} from "../src/ui/templates.mts";
import type { FileEntry } from "../src/types.mts";
import { assertEquals } from "@std/assert";

Deno.test("escapeHtml: & becomes &amp;", () => {
  assertEquals(escapeHtml("a & b"), "a &amp; b");
});

Deno.test("escapeHtml: < becomes &lt;", () => {
  assertEquals(escapeHtml("a < b"), "a &lt; b");
});

Deno.test("escapeHtml: > becomes &gt;", () => {
  assertEquals(escapeHtml("a > b"), "a &gt; b");
});

Deno.test("escapeHtml: double quote becomes &quot;", () => {
  assertEquals(escapeHtml('say "hello"'), "say &quot;hello&quot;");
});

Deno.test("escapeHtml: single quote becomes &#39;", () => {
  assertEquals(escapeHtml("it's"), "it&#39;s");
});

Deno.test("escapeHtml: plain text unchanged", () => {
  assertEquals(escapeHtml("hello world"), "hello world");
});

Deno.test("escapeHtml: multiple special chars all escaped", () => {
  assertEquals(escapeHtml("<script>&&"), "&lt;script&gt;&amp;&amp;");
});

Deno.test("escapeHtml: empty string returns empty", () => {
  assertEquals(escapeHtml(""), "");
});

Deno.test("generateDirectoryListingHTML: directories sorted before files", () => {
  const entries: FileEntry[] = [
    { name: "file.txt", isDirectory: false, url: "/file.txt" },
    { name: "docs", isDirectory: true, url: "/docs" },
    { name: "a.js", isDirectory: false, url: "/a.js" },
  ];
  const html = generateDirectoryListingHTML(entries, "/");
  const docsIdx = html.indexOf('href="/docs"');
  const fileIdx = html.indexOf('href="/file.txt"');
  const jsIdx = html.indexOf('href="/a.js"');
  assertEquals(docsIdx < fileIdx && docsIdx < jsIdx, true);
});

Deno.test("generateDirectoryListingHTML: entries sorted alphabetically within type", () => {
  const entries: FileEntry[] = [
    { name: "z.txt", isDirectory: false, url: "/z.txt" },
    { name: "a.txt", isDirectory: false, url: "/a.txt" },
  ];
  const html = generateDirectoryListingHTML(entries, "/");
  const aIdx = html.indexOf('href="/a.txt"');
  const zIdx = html.indexOf('href="/z.txt"');
  assertEquals(aIdx > 0 && aIdx < zIdx, true);
});

Deno.test("generateDirectoryListingHTML: parent dir link at non-root", () => {
  const entries: FileEntry[] = [
    { name: "file.txt", isDirectory: false, url: "/sub/file.txt" },
  ];
  const html = generateDirectoryListingHTML(entries, "/sub");
  assertEquals(html.includes('href="../"'), true);
});

Deno.test("generateDirectoryListingHTML: no parent dir link at root", () => {
  const entries: FileEntry[] = [];
  const html = generateDirectoryListingHTML(entries, "/");
  assertEquals(html.includes('href="../"'), false);
});

Deno.test("generateDirectoryListingHTML: special chars in filename are escaped", () => {
  const entries: FileEntry[] = [
    {
      name: '<script>alert("xss")</script>',
      isDirectory: false,
      url: "/%3Cscript%3Ealert%28%22xss%22%29%3C/script%3E",
    },
  ];
  const html = generateDirectoryListingHTML(entries, "/");
  assertEquals(html.includes("<script>"), false);
  assertEquals(html.includes("&lt;script&gt;"), true);
});

Deno.test("generateDirectoryListingHTML: URL path is encoded in href", () => {
  const entries: FileEntry[] = [
    { name: "my file.html", isDirectory: false, url: "/my%20file.html" },
  ];
  const html = generateDirectoryListingHTML(entries, "/");
  assertEquals(html.includes('href="/my%20file.html"'), true);
});

Deno.test("generateDirectoryListingHTML: empty directory shows empty-state", () => {
  const entries: FileEntry[] = [];
  const html = generateDirectoryListingHTML(entries, "/");
  assertEquals(html.includes("This directory is empty"), true);
});

Deno.test("generateDirectoryListingHTML: output is valid HTML structure", () => {
  const entries: FileEntry[] = [];
  const html = generateDirectoryListingHTML(entries, "/");
  assertEquals(html.includes("<!DOCTYPE html>"), true);
  assertEquals(html.includes("<html"), true);
  assertEquals(html.includes("<body"), true);
  assertEquals(html.includes("</html>"), true);
});

Deno.test("generateDirectoryListingHTML: filename with special chars produces safe href", () => {
  const entries: FileEntry[] = [
    {
      name: '<script>alert("xss")</script>',
      isDirectory: false,
      url: "/%3Cscript%3Ealert%28%22xss%22%29%3C/script%3E",
    },
  ];
  const html = generateDirectoryListingHTML(entries, "/");
  assertEquals(html.includes("<script>alert"), false);
  assertEquals(html.includes("&lt;script"), true);
});

Deno.test("generateDirectoryListingHTML: has theme toggle", () => {
  const entries: FileEntry[] = [];
  const html = generateDirectoryListingHTML(entries, "/");
  assertEquals(html.includes('id="dark"'), true);
});
