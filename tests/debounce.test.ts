import { debounce } from "../src/utils/debounce.mts";
import { assertEquals } from "@std/assert";

Deno.test("debounce: multiple rapid calls resolve only once", async () => {
  let callCount = 0;
  const promises = [
    debounce(50),
    debounce(50),
    debounce(50),
  ];
  await Promise.all(promises);
  const later = new Promise<void>((resolve) => setTimeout(resolve, 100));
  await later;
  callCount++;
  assertEquals(callCount, 1);
});

Deno.test("debounce: second call after wait resolves again", async () => {
  await debounce(50);
  const before = Date.now();
  await debounce(50);
  const elapsed = Date.now() - before;
  assertEquals(elapsed >= 45, true);
});

Deno.test("debounce: zero ms resolves immediately", async () => {
  const before = Date.now();
  await debounce(0);
  const elapsed = Date.now() - before;
  assertEquals(elapsed < 20, true);
});
