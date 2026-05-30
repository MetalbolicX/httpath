import { assertEquals } from "@std/assert";
import { createRateLimiter } from "../src/security/rate-limiter.mts";

const createClock = (start = 0) => {
  let now = start;

  return {
    now: () => now,
    advance: (ms: number) => {
      now += ms;
    },
  };
};

Deno.test("createRateLimiter: allows five attempts then blocks", () => {
  const clock = createClock();
  const limiter = createRateLimiter({ now: clock.now });

  for (let attempt = 0; attempt < 5; attempt++) {
    assertEquals(limiter.check("203.0.113.10"), true);
  }

  assertEquals(limiter.check("203.0.113.10"), false);
});

Deno.test("createRateLimiter: resets after the window expires", () => {
  const clock = createClock();
  const limiter = createRateLimiter({ now: clock.now, windowMs: 1_000 });

  for (let attempt = 0; attempt < 5; attempt++) {
    assertEquals(limiter.check("203.0.113.11"), true);
  }

  assertEquals(limiter.check("203.0.113.11"), false);
  clock.advance(1_001);
  assertEquals(limiter.check("203.0.113.11"), true);
});

Deno.test("createRateLimiter: keeps attempts isolated per IP", () => {
  const clock = createClock();
  const limiter = createRateLimiter({ now: clock.now, maxAttempts: 1 });

  assertEquals(limiter.check("203.0.113.12"), true);
  assertEquals(limiter.check("203.0.113.12"), false);
  assertEquals(limiter.check("203.0.113.13"), true);
});

Deno.test("createRateLimiter: evicts oldest entries when maxEntries is reached", () => {
  const clock = createClock();
  const limiter = createRateLimiter({
    now: clock.now,
    maxAttempts: 1,
    maxEntries: 2,
  });

  assertEquals(limiter.check("a"), true);
  assertEquals(limiter.check("b"), true);
  assertEquals(limiter.check("c"), true);
  assertEquals(limiter.check("a"), true);
});
