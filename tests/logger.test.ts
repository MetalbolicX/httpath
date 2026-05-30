import { log, setLogLevel } from "../src/utils/index.ts";
import { assertEquals } from "@std/assert";

Deno.test("log: level filtering via console output capture", async (t) => {
  await t.step("info prints when level is info", () => {
    setLogLevel("info");
    let called = false;
    let output = "";
    const original = console.log;
    console.log = (o: string) => {
      called = true;
      output = o;
    };
    try {
      log("test message", "info");
      assertEquals(called, true);
      assertEquals(output.includes("INFO"), true);
    } finally {
      console.log = original;
    }
  });

  await t.step("debug is suppressed when level is info", () => {
    setLogLevel("info");
    let called = false;
    const original = console.log;
    console.log = () => {
      called = true;
    };
    try {
      log("test message", "debug");
      assertEquals(called, false);
    } finally {
      console.log = original;
    }
  });

  await t.step("error prints when level is info", () => {
    setLogLevel("info");
    let called = false;
    const original = console.log;
    console.log = () => {
      called = true;
    };
    try {
      log("test message", "error");
      assertEquals(called, true);
    } finally {
      console.log = original;
    }
  });

  await t.step("debug prints when level is debug", () => {
    setLogLevel("debug");
    let called = false;
    const original = console.log;
    console.log = () => {
      called = true;
    };
    try {
      log("test message", "debug");
      assertEquals(called, true);
    } finally {
      console.log = original;
    }
  });

  await t.step("info is suppressed when level is error", () => {
    setLogLevel("error");
    let called = false;
    const original = console.log;
    console.log = () => {
      called = true;
    };
    try {
      log("test message", "info");
      assertEquals(called, false);
    } finally {
      console.log = original;
    }
  });

  await t.step("error prints when level is error", () => {
    setLogLevel("error");
    let called = false;
    const original = console.log;
    console.log = () => {
      called = true;
    };
    try {
      log("test message", "error");
      assertEquals(called, true);
    } finally {
      console.log = original;
    }
  });

  await t.step("output includes ISO timestamp", () => {
    setLogLevel("info");
    let output = "";
    const original = console.log;
    console.log = (o: string) => {
      output = o;
    };
    try {
      log("test message", "info");
      const timestampMatch = output.match(
        /^\[\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/,
      );
      assertEquals(timestampMatch !== null, true);
    } finally {
      console.log = original;
    }
  });

  await t.step("output includes level padded to 5 chars", () => {
    setLogLevel("info");
    let output = "";
    const original = console.log;
    console.log = (o: string) => {
      output = o;
    };
    try {
      log("test message", "error");
      assertEquals(output.includes("ERROR"), true);
      assertEquals(output.includes("INFO"), false);
    } finally {
      console.log = original;
    }
  });

  await t.step("absolute filesystem paths are redacted", () => {
    setLogLevel("info");
    let output = "";
    const original = console.log;
    console.log = (o: string) => {
      output = o;
    };
    try {
      const path = Deno.cwd();
      log(`Serving directory: ${path}`, "info");
      assertEquals(output.includes(path), false);
      assertEquals(output.includes("[path]"), true);
    } finally {
      console.log = original;
    }
  });

  await t.step("relative paths are preserved", () => {
    setLogLevel("info");
    let output = "";
    const original = console.log;
    console.log = (o: string) => {
      output = o;
    };
    try {
      log("Serving directory: ./public", "info");
      assertEquals(output.includes("./public"), true);
    } finally {
      console.log = original;
    }
  });
});
