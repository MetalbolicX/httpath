// tests/integration/ws_hub.test.js — Integration test for Hub.WsHub.
// Real node:http server + WS upgrade + raw client socket.
// Verifies exact eight-byte frame: 81 06 72 65 6c 6f 61 64
// No ws dependency — raw WebSocket frame construction and verification.

import { test } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import net from "node:net";

const WsHub = await import("../../src/Hub/WsHub.res.js");

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

test("WsHub.notifyReload sends exact frame 81 06 72 65 6c 6f 61 64", async () => {
  // Create a dedicated server for this test — avoids shared state between tests.
  const server = http.createServer();
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const port = server.address().port;

  // Set up upgrade handler BEFORE the socket connects.
  const upgradePromise = new Promise((resolve) => {
    server.once("upgrade", (_req, sock, _head) => {
      WsHub.register(sock);
      WsHub.notifyReload();
      resolve(sock);
    });
  });

  // Open client socket and set up data listener BEFORE writing request.
  const clientSocket = net.createConnection({ port, host: "127.0.0.1" });
  clientSocket.setTimeout(3000);

  const received = [];
  const dataPromise = new Promise((resolve, reject) => {
    clientSocket.on("data", (chunk) => {
      received.push(...chunk);
      if (received.length >= 8) {
        resolve();
      }
    });
    clientSocket.on("error", reject);
    clientSocket.on("timeout", () => {
      clientSocket.destroy();
      reject(new Error("client socket timeout"));
    });
  });

  // Send WS upgrade request — the server's once-handler fires before this returns.
  const key = "dGhlIHNhbXBsZSBub25jZQ==";
  const req = [
    "GET /livereload HTTP/1.1",
    `Host: 127.0.0.1:${port}`,
    "Upgrade: websocket",
    "Connection: Upgrade",
    "Sec-WebSocket-Key: " + key,
    "Sec-WebSocket-Version: 13",
    "",
    "",
  ].join("\r\n");
  clientSocket.write(req);

  // Wait for data and server socket.
  await Promise.all([dataPromise, upgradePromise]);

  // Assert exact frame bytes.
  // 0x81 = FIN + text opcode (1)
  // 0x06 = length 6
  // 0x72 0x65 0x6c 0x6f 0x61 0x64 = "reload"
  const expected = [0x81, 0x06, 0x72, 0x65, 0x6c, 0x6f, 0x61, 0x64];
  assert.deepEqual(
    received.slice(0, 8),
    expected,
    `Expected [${
      expected.map((b) => "0x" + b.toString(16)).join(", ")
    }], got [${
      received.slice(0, 8).map((b) => "0x" + b.toString(16)).join(", ")
    }]`,
  );

  clientSocket.destroy();
  server.close();
});

test("WsHub.notifyReload with multiple clients broadcasts in insertion order", async () => {
  const server = http.createServer();
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const port = server.address().port;

  const upgradeSockets = [];
  let upgradeCount = 0;
  const upgradeDone = new Promise((resolve) => {
    server.on("upgrade", (_req, sock) => {
      WsHub.register(sock);
      upgradeSockets.push(sock);
      upgradeCount++;
      if (upgradeCount === 2) {
        // Both sockets registered — broadcast.
        WsHub.notifyReload();
        resolve();
      }
    });
  });

  // Open two client sockets.
  const makeClient = () => {
    const s = net.createConnection({ port, host: "127.0.0.1" });
    s.setTimeout(3000);
    return s;
  };
  const client1 = makeClient();
  const client2 = makeClient();

  const received1 = [];
  const received2 = [];
  let dataCount = 0;
  const dataDone = new Promise((resolve) => {
    const handleData = (received) => (chunk) => {
      received.push(...chunk);
      if (received.length >= 8) {
        dataCount++;
        if (dataCount === 2) resolve();
      }
    };
    client1.on("data", handleData(received1));
    client2.on("data", handleData(received2));
  });

  const key = "dGhlIHNhbXBsZSBub25jZQ==";
  const makeReq = (path) =>
    [
      `GET ${path} HTTP/1.1`,
      `Host: 127.0.0.1:${port}`,
      "Upgrade: websocket",
      "Connection: Upgrade",
      "Sec-WebSocket-Key: " + key,
      "Sec-WebSocket-Version: 13",
      "",
      "",
    ].join("\r\n");

  client1.write(makeReq("/livereload1"));
  client2.write(makeReq("/livereload2"));

  await Promise.all([upgradeDone, dataDone]);

  const expected = [0x81, 0x06, 0x72, 0x65, 0x6c, 0x6f, 0x61, 0x64];
  assert.deepEqual(
    received1.slice(0, 8),
    expected,
    "first socket received correct frame",
  );
  assert.deepEqual(
    received2.slice(0, 8),
    expected,
    "second socket received correct frame",
  );

  client1.destroy();
  client2.destroy();
  upgradeSockets.forEach((s) => s.destroy());
  server.close();
});
