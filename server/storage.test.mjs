import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { createApp } from "./app.mjs";

test("storage selection uses authenticated desktop callbacks and ignores browser-supplied paths", async (t) => {
  const dataDir = await mkdtemp(path.join(tmpdir(), "projispace-storage-api-"));
  let chooses = 0, cancels = 0;
  const current = { available: true, currentPath: dataDir, pendingPath: null };
  const service = await createApp({ dataDir, seed: false, accessToken: "test-secret", storage: {
    status: () => current,
    choose: async () => { chooses++; return current; },
    cancel: async () => { cancels++; return current; },
  } });
  t.after(async () => { await service.close(); await rm(dataDir, { recursive: true, force: true }); });
  await new Promise(resolve => service.server.listen(0, "127.0.0.1", resolve));
  const origin = `http://127.0.0.1:${service.server.address().port}`;
  const headers = { cookie: "sidequest_session=test-secret", "content-type": "application/json" };
  assert.equal((await fetch(origin + "/api/storage")).status, 403);
  assert.equal((await fetch(origin + "/api/storage", { method: "POST", headers: { ...headers, origin: "https://example.com" } })).status, 403);
  assert.deepEqual(await (await fetch(origin + "/api/storage", { headers })).json(), current);
  assert.equal((await fetch(origin + "/api/storage", { method: "POST", headers, body: JSON.stringify({ directory: "C:\\do-not-use" }) })).status, 200);
  assert.equal((await fetch(origin + "/api/storage", { method: "DELETE", headers })).status, 200);
  assert.equal(chooses, 1);
  assert.equal(cancels, 1);
});

test("web mode reports storage selection unavailable", async (t) => {
  const dataDir = await mkdtemp(path.join(tmpdir(), "projispace-storage-web-"));
  const service = await createApp({ dataDir, seed: false });
  t.after(async () => { await service.close(); await rm(dataDir, { recursive: true, force: true }); });
  await new Promise(resolve => service.server.listen(0, "127.0.0.1", resolve));
  const origin = `http://127.0.0.1:${service.server.address().port}`;
  assert.equal((await (await fetch(origin + "/api/storage")).json()).available, false);
  assert.equal((await fetch(origin + "/api/storage", { method: "POST" })).status, 404);
});
