import { getMimeType } from "../src/utils/mime.mts";
import { assertEquals } from "@std/assert";

Deno.test("getMimeType: .html returns text/html", () => {
  assertEquals(getMimeType("index.html"), "text/html; charset=UTF-8");
});

Deno.test("getMimeType: .htm returns text/html", () => {
  assertEquals(getMimeType("index.htm"), "text/html; charset=UTF-8");
});

Deno.test("getMimeType: .css returns text/css", () => {
  assertEquals(getMimeType("style.css"), "text/css; charset=UTF-8");
});

Deno.test("getMimeType: .js returns application/javascript", () => {
  assertEquals(getMimeType("app.js"), "text/javascript; charset=UTF-8");
});

Deno.test("getMimeType: .json returns application/json", () => {
  assertEquals(getMimeType("data.json"), "application/json; charset=UTF-8");
});

Deno.test("getMimeType: .png returns image/png", () => {
  assertEquals(getMimeType("image.png"), "image/png");
});

Deno.test("getMimeType: .jpg returns image/jpeg", () => {
  assertEquals(getMimeType("photo.jpg"), "image/jpeg");
});

Deno.test("getMimeType: .gif returns image/gif", () => {
  assertEquals(getMimeType("anim.gif"), "image/gif");
});

Deno.test("getMimeType: .svg returns image/svg+xml", () => {
  assertEquals(getMimeType("icon.svg"), "image/svg+xml");
});

Deno.test("getMimeType: .txt returns text/plain", () => {
  assertEquals(getMimeType("readme.txt"), "text/plain; charset=UTF-8");
});

Deno.test("getMimeType: no extension returns application/octet-stream", () => {
  assertEquals(getMimeType("Makefile"), "application/octet-stream");
});

Deno.test("getMimeType: query string causes fallback to octet-stream", () => {
  assertEquals(getMimeType("app.js?v=1"), "application/octet-stream");
});

Deno.test("getMimeType: multiple dots uses last extension", () => {
  assertEquals(getMimeType("app.min.css"), "text/css; charset=UTF-8");
});

Deno.test("getMimeType: path with directory uses file extension", () => {
  assertEquals(getMimeType("/var/www/index.html"), "text/html; charset=UTF-8");
});

Deno.test("getMimeType: .woff2 returns font/woff2", () => {
  assertEquals(getMimeType("font.woff2"), "font/woff2");
});
