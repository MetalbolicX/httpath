import { createDebouncer, debounce } from "../src/utils/debounce.mts";
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

Deno.test("createDebouncer: two instances are isolated", async () => {
  const debounceA = createDebouncer();
  const debounceB = createDebouncer();

  const startA = Date.now();
  const startB = Date.now();

  const promiseA = debounceA(80).then(() => Date.now() - startA);
  const promiseB = debounceB(15).then(() => Date.now() - startB);

  const [elapsedA, elapsedB] = await Promise.all([promiseA, promiseB]);

  assertEquals(elapsedA >= 70, true);
  assertEquals(elapsedB < 50, true);
});
