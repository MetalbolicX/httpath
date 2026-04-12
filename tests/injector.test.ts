import {
  getLiveReloadScript,
  injectLiveReloadScript,
} from "../src/ui/injector.mts";
import { assertEquals } from "@std/assert";

Deno.test("injectLiveReloadScript: injects before </body> when present", () => {
  const html = "<html><body><p>Hello</p></body></html>";
  const result = injectLiveReloadScript(html, 8080);
  const bodyIndex = result.indexOf("</body>");
  const scriptIndex = result.indexOf("<script>");
  assertEquals(bodyIndex > -1, true);
  assertEquals(scriptIndex > -1 && scriptIndex < bodyIndex, true);
});

Deno.test("injectLiveReloadScript: injects before </html> when no </body>", () => {
  const html = "<html><body><p>Hello</p></html>";
  const result = injectLiveReloadScript(html, 8080);
  const htmlCloseIndex = result.lastIndexOf("</html>");
  const scriptIndex = result.indexOf("<script>");
  assertEquals(htmlCloseIndex > -1, true);
  assertEquals(scriptIndex > -1 && scriptIndex < htmlCloseIndex, true);
});

Deno.test("injectLiveReloadScript: appends at end when no body or html tag", () => {
  const html = "<p>Hello World</p>";
  const result = injectLiveReloadScript(html, 8080);
  assertEquals(result.endsWith("<script>"), false);
  assertEquals(result.includes("<script>"), true);
});

Deno.test("injectLiveReloadScript: empty string appends script", () => {
  const result = injectLiveReloadScript("", 8080);
  assertEquals(result.includes("<script>"), true);
});

Deno.test("getLiveReloadScript: contains the correct port", () => {
  const script = getLiveReloadScript(3000);
  assertEquals(script.includes("3000"), true);
});

Deno.test("getLiveReloadScript: uses window.location.port fallback", () => {
  const script = getLiveReloadScript(8080);
  assertEquals(script.includes("window.location.port"), true);
});

Deno.test("getLiveReloadScript: uses ws or wss based on protocol", () => {
  const script = getLiveReloadScript(8080);
  assertEquals(script.includes("wss:") || script.includes("ws:"), true);
});

Deno.test("getLiveReloadScript: connects to /livereload endpoint", () => {
  const script = getLiveReloadScript(8080);
  assertEquals(script.includes("/livereload"), true);
});

Deno.test("getLiveReloadScript: has reconnect logic on close", () => {
  const script = getLiveReloadScript(8080);
  assertEquals(script.includes("onclose"), true);
  assertEquals(script.includes("setTimeout"), true);
  assertEquals(script.includes("reconnect"), true);
});

Deno.test("getLiveReloadScript: reloads page on message", () => {
  const script = getLiveReloadScript(8080);
  assertEquals(script.includes("reload"), true);
  assertEquals(script.includes("window.location.reload"), true);
});
