import {
  DEFAULT_CONFIG,
  getPortWarning,
  getPublicHostWarning,
  getTrustProxyWarning,
  parseArguments,
} from "../src/cli/parser.mts";
import { assertEquals, assertThrows } from "@std/assert";

Deno.test("DEFAULT_CONFIG has expected defaults", () => {
  assertEquals(DEFAULT_CONFIG.directory, Deno.cwd());
  assertEquals(DEFAULT_CONFIG.hostname, "127.0.0.1");
  assertEquals(DEFAULT_CONFIG.port, 8080);
  assertEquals(DEFAULT_CONFIG.rateLimitMaxRequests, 5);
  assertEquals(DEFAULT_CONFIG.rateLimitWindowMs, 60_000);
  assertEquals(DEFAULT_CONFIG.ignorePatterns, [
    ".git",
    "node_modules",
    ".DS_Store",
  ]);
  assertEquals(DEFAULT_CONFIG.enableDirectoryListing, false);
  assertEquals(DEFAULT_CONFIG.logLevel, "info");
  assertEquals(DEFAULT_CONFIG.enableLiveReload, true);
  assertEquals(DEFAULT_CONFIG.restartOnChange, false);
  assertEquals(
    (DEFAULT_CONFIG as unknown as { trustProxy: boolean }).trustProxy,
    false,
  );
});

Deno.test("parseArguments: empty args uses defaults", () => {
  const config = parseArguments([]);
  assertEquals(config.directory, DEFAULT_CONFIG.directory);
  assertEquals(config.hostname, DEFAULT_CONFIG.hostname);
  assertEquals(config.port, 8080);
  assertEquals(config.rateLimitMaxRequests, 5);
  assertEquals(config.rateLimitWindowMs, 60_000);
  assertEquals(config.enableDirectoryListing, false);
  assertEquals(config.enableLiveReload, true);
  assertEquals(config.restartOnChange, false);
  assertEquals(config.logLevel, "info");
  assertEquals(
    (config as unknown as { trustProxy: boolean }).trustProxy,
    false,
  );
});

Deno.test("parseArguments: --listing enables directory listing", () => {
  const config = parseArguments(["--listing"]);
  assertEquals(config.enableDirectoryListing, true);
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

Deno.test("parseArguments: --host sets custom hostname", () => {
  const config = parseArguments(["--host", "0.0.0.0"]);
  assertEquals(config.hostname, "0.0.0.0");
});

Deno.test("parseArguments: rate limit flags set custom limits", () => {
  const config = parseArguments([
    "--rate-limit-max-requests",
    "12",
    "--rate-limit-window-ms",
    "2500",
  ]);

  assertEquals(config.rateLimitMaxRequests, 12);
  assertEquals(config.rateLimitWindowMs, 2500);
});

Deno.test("getPublicHostWarning: loopback hosts do not warn", () => {
  assertEquals(getPublicHostWarning("127.0.0.1"), null);
  assertEquals(getPublicHostWarning("localhost"), null);
  assertEquals(getPublicHostWarning("::1"), null);
});

Deno.test("getPublicHostWarning: public hosts emit a warning", () => {
  const warning = getPublicHostWarning("0.0.0.0");

  assertEquals(warning !== null, true);
  assertEquals(warning?.includes("0.0.0.0"), true);
  assertEquals(warning?.includes("localhost-only"), true);
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

Deno.test("parseArguments: --trust-proxy enables proxy trust", () => {
  const config = parseArguments(["--trust-proxy"]);
  assertEquals((config as unknown as { trustProxy: boolean }).trustProxy, true);
});

Deno.test("parseArguments: port 0 is allowed for ephemeral allocation", () => {
  const config = parseArguments(["--port", "0"]);
  assertEquals(config.port, 0);
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

Deno.test("parseArguments: --lan sets hostname to 0.0.0.0 and lan to true", () => {
  const config = parseArguments(["--lan"]);
  assertEquals(config.hostname, "0.0.0.0");
  assertEquals(config.lan, true);
});

Deno.test("parseArguments: -l produces same result as --lan", () => {
  const config = parseArguments(["-l"]);
  assertEquals(config.hostname, "0.0.0.0");
  assertEquals(config.lan, true);
});

Deno.test("parseArguments: --lan and --host together uses --host value", () => {
  // --host takes precedence over --lan
  const config = parseArguments(["--lan", "--host", "192.168.1.100"]);
  assertEquals(config.hostname, "192.168.1.100");
  assertEquals(config.lan, true);
});

Deno.test("DEFAULT_CONFIG has lan: false by default", () => {
  assertEquals(DEFAULT_CONFIG.lan, false);
});

Deno.test("parseArguments: --rate-limit-max-requests with NaN throws", () => {
  assertThrows(
    () => parseArguments(["--rate-limit-max-requests", "abc"]),
    Error,
    "positive integer",
  );
});

Deno.test("parseArguments: --rate-limit-max-requests with zero throws", () => {
  assertThrows(
    () => parseArguments(["--rate-limit-max-requests", "0"]),
    Error,
    "positive integer",
  );
});

Deno.test("parseArguments: --rate-limit-max-requests with negative throws", () => {
  assertThrows(
    () => parseArguments(["--rate-limit-max-requests", "-5"]),
    Error,
    "positive integer",
  );
});

Deno.test("parseArguments: --rate-limit-window-ms with NaN throws", () => {
  assertThrows(
    () => parseArguments(["--rate-limit-window-ms", "xyz"]),
    Error,
    "positive integer",
  );
});

Deno.test("parseArguments: --rate-limit-window-ms with zero throws", () => {
  assertThrows(
    () => parseArguments(["--rate-limit-window-ms", "0"]),
    Error,
    "positive integer",
  );
});

Deno.test("getPortWarning: port 0 returns warning", () => {
  const warning = getPortWarning(0);
  assertEquals(warning !== null, true);
  assertEquals(warning?.includes("ephemeral"), true);
});

Deno.test("getPortWarning: non-zero port returns null", () => {
  assertEquals(getPortWarning(80), null);
  assertEquals(getPortWarning(8080), null);
  assertEquals(getPortWarning(1), null);
  assertEquals(getPortWarning(65535), null);
});

Deno.test("getTrustProxyWarning: trustProxy true returns warning", () => {
  const warning = getTrustProxyWarning(true);
  assertEquals(warning !== null, true);
  assertEquals(warning?.includes("reverse proxy"), true);
});

Deno.test("getTrustProxyWarning: trustProxy false returns null", () => {
  assertEquals(getTrustProxyWarning(false), null);
});
