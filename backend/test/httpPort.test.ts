import assert from "node:assert/strict";
import { once } from "node:events";
import { createServer } from "node:http";
import { test } from "node:test";
import { randomHttpPort } from "./helpers/httpPort.js";

test("registration test port selection produces URLs fetch can request", async (t) => {
  // 0.81 previously chose 6667: Node can listen there, but fetch blocks the request.
  for (const draw of [0, 0.81, 0.999]) {
    await t.test(`random draw ${draw}`, async (t) => {
      t.mock.method(Math, "random", () => draw);
      const server = createServer((_req, res) => { res.end("OK"); });
      try {
        server.listen(randomHttpPort(), "127.0.0.1");
        await once(server, "listening");
        const address = server.address();
        assert.ok(address && typeof address !== "string");
        const response = await fetch(`http://127.0.0.1:${address.port}/api/health`);
        assert.equal(response.status, 200);
        assert.equal(await response.text(), "OK");
      } finally {
        await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
      }
    });
  }
});
