import { assertEquals } from "@std/assert";
import {
  buildRestartArgs,
  createRestartCooldownGate,
} from "../src/watcher/monitor.mts";

Deno.test("buildRestartArgs includes least-privilege restart permissions", () => {
  const args = buildRestartArgs("httpath.ts", ["--dir", "./demo"]);

  assertEquals(args, [
    "run",
    "-RN",
    "--allow-run",
    "--allow-env",
    "--sloppy-imports",
    "httpath.ts",
    "--dir",
    "./demo",
  ]);
});

Deno.test("createRestartCooldownGate blocks rapid repeated restarts", () => {
  const gate = createRestartCooldownGate(1000);

  assertEquals(gate(1_000), true);
  assertEquals(gate(1_500), false);
  assertEquals(gate(2_100), true);
});

Deno.test("createRestartCooldownGate resets after cooldown window", () => {
  const gate = createRestartCooldownGate(250);

  assertEquals(gate(10), true);
  assertEquals(gate(240), false);
  assertEquals(gate(260), true);
});
