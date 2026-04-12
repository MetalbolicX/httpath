import { DEFAULT_CONFIG, parseArguments } from "../src/cli/parser.mts";
import { assertEquals, assertThrows } from "@std/assert";

Deno.test("DEFAULT_CONFIG has expected defaults", () => {
  assertEquals(DEFAULT_CONFIG.directory, Deno.cwd());
  assertEquals(DEFAULT_CONFIG.port, 8080);
  assertEquals(DEFAULT_CONFIG.ignorePatterns, [
    ".git",
    "node_modules",
    ".DS_Store",
  ]);
  assertEquals(DEFAULT_CONFIG.enableDirectoryListing, true);
  assertEquals(DEFAULT_CONFIG.logLevel, "info");
  assertEquals(DEFAULT_CONFIG.enableLiveReload, true);
  assertEquals(DEFAULT_CONFIG.restartOnChange, false);
});

Deno.test("parseArguments: empty args uses defaults", () => {
  const config = parseArguments([]);
  assertEquals(config.directory, DEFAULT_CONFIG.directory);
  assertEquals(config.port, 8080);
  assertEquals(config.enableDirectoryListing, true);
  assertEquals(config.enableLiveReload, true);
  assertEquals(config.restartOnChange, false);
  assertEquals(config.logLevel, "info");
});

Deno.test("parseArguments: -p sets custom port", () => {
  const config = parseArguments(["-p", "3000"]);
  assertEquals(config.port, 3000);
});

Deno.test("parseArguments: --port sets custom port", () => {
  const config = parseArguments(["--port", "9090"]);
  assertEquals(config.port, 9090);
});

Deno.test("parseArguments: -d sets custom directory", () => {
  const config = parseArguments(["-d", "/tmp"]);
  assertEquals(config.directory, "/tmp");
});

Deno.test("parseArguments: --dir sets custom directory", () => {
  const config = parseArguments(["--dir", "/var/log"]);
  assertEquals(config.directory, "/var/log");
});

Deno.test("parseArguments: -i parses comma-separated ignore patterns", () => {
  const config = parseArguments(["-i", "*.log,temp*,.cache"]);
  assertEquals(config.ignorePatterns, ["*.log", "temp*", ".cache"]);
});

Deno.test("parseArguments: --no-listing disables directory listing", () => {
  const config = parseArguments(["--no-listing"]);
  assertEquals(config.enableDirectoryListing, false);
});

Deno.test("parseArguments: --no-live-reload disables live reload", () => {
  const config = parseArguments(["--no-live-reload"]);
  assertEquals(config.enableLiveReload, false);
});

Deno.test("parseArguments: --restart-on-change enables server restart", () => {
  const config = parseArguments(["--restart-on-change"]);
  assertEquals(config.restartOnChange, true);
});

Deno.test("parseArguments: -r enables server restart", () => {
  const config = parseArguments(["-r"]);
  assertEquals(config.restartOnChange, true);
});

Deno.test("parseArguments: --log debug sets debug log level", () => {
  const config = parseArguments(["--log", "debug"]);
  assertEquals(config.logLevel, "debug");
});

Deno.test("parseArguments: --log error sets error log level", () => {
  const config = parseArguments(["--log", "error"]);
  assertEquals(config.logLevel, "error");
});

Deno.test("parseArguments: port 0 throws", () => {
  assertThrows(
    () => parseArguments(["--port", "0"]),
    Error,
    "Port must be a valid number",
  );
});

Deno.test("parseArguments: port 66666 throws", () => {
  assertThrows(
    () => parseArguments(["--port", "66666"]),
    Error,
    "Port must be a valid number",
  );
});

Deno.test("parseArguments: negative port throws", () => {
  assertThrows(
    () => parseArguments(["--port", "-1"]),
    Error,
    "Port must be a valid number",
  );
});
