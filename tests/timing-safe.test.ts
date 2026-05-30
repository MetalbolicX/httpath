import { assertEquals } from "@std/assert";
import { timingSafeEqual } from "../src/security/timing-safe.mts";

Deno.test("timingSafeEqual: equal strings match", () => {
  assertEquals(timingSafeEqual("admin", "admin"), true);
});

Deno.test("timingSafeEqual: unequal strings do not match", () => {
  assertEquals(timingSafeEqual("admin", "Admin"), false);
});

Deno.test("timingSafeEqual: empty strings compare correctly", () => {
  assertEquals(timingSafeEqual("", ""), true);
  assertEquals(timingSafeEqual("", "non-empty"), false);
});

Deno.test("timingSafeEqual: unicode strings compare by bytes", () => {
  assertEquals(timingSafeEqual("pässwörd🔐", "pässwörd🔐"), true);
  assertEquals(timingSafeEqual("pässwörd🔐", "pässwørd🔐"), false);
});

Deno.test("timingSafeEqual: prefix mismatch does not pass", () => {
  assertEquals(timingSafeEqual("secret", "secret-123"), false);
});
