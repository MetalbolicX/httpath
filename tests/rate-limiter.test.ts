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
    const result = limiter.check("203.0.113.10");
    assertEquals(result.allowed, true);
  }

  const blocked = limiter.check("203.0.113.10");
  assertEquals(blocked.allowed, false);
  assertEquals(blocked.remaining, 0);
});

Deno.test("createRateLimiter: resets after the window expires", () => {
  const clock = createClock();
  const limiter = createRateLimiter({ now: clock.now, windowMs: 1_000 });

  for (let attempt = 0; attempt < 5; attempt++) {
    const result = limiter.check("203.0.113.11");
    assertEquals(result.allowed, true);
  }

  const blocked = limiter.check("203.0.113.11");
  assertEquals(blocked.allowed, false);
  clock.advance(1_001);
  const reset = limiter.check("203.0.113.11");
  assertEquals(reset.allowed, true);
});

Deno.test("createRateLimiter: keeps attempts isolated per IP", () => {
  const clock = createClock();
  const limiter = createRateLimiter({ now: clock.now, maxAttempts: 1 });

  const first = limiter.check("203.0.113.12");
  assertEquals(first.allowed, true);
  assertEquals(first.remaining, 0);

  const blocked = limiter.check("203.0.113.12");
  assertEquals(blocked.allowed, false);

  const second = limiter.check("203.0.113.13");
  assertEquals(second.allowed, true);
});

Deno.test("createRateLimiter: evicts oldest entries when maxEntries is reached", () => {
  const clock = createClock();
  const limiter = createRateLimiter({
    now: clock.now,
    maxAttempts: 1,
    maxEntries: 2,
  });

  const a1 = limiter.check("a");
  assertEquals(a1.allowed, true);

  const b1 = limiter.check("b");
  assertEquals(b1.allowed, true);

  const c1 = limiter.check("c");
  assertEquals(c1.allowed, true);

  const a2 = limiter.check("a");
  assertEquals(a2.allowed, true);
});