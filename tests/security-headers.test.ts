import { assertEquals } from "@std/assert";
import {
  addSecurityHeaders,
  SECURITY_HEADERS,
} from "../src/security/headers.mts";

Deno.test("addSecurityHeaders: adds the complete security header set", async () => {
  const response = new Response("ok", {
    status: 200,
    headers: {
      "content-type": "text/plain",
      "x-custom": "keep-me",
    },
  });

  const secured = addSecurityHeaders(response);

  assertEquals(secured.status, 200);
  assertEquals(await secured.text(), "ok");
  assertEquals(secured.headers.get("content-type"), "text/plain");
  assertEquals(secured.headers.get("x-custom"), "keep-me");

  for (const [key, value] of Object.entries(SECURITY_HEADERS)) {
    assertEquals(secured.headers.get(key), value);
  }
});
