import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { createApp } from "./app.mjs";

test("assistant setup routes protect downloads and persist the selected model used for inference", async (t) => {
  const dataDir = await mkdtemp(path.join(tmpdir(), "projispace-setup-api-"));
  const installed = new Set(["qwen3.5:9b", "custom-agent:latest"]);
  let remoteCustom = false;
  const requests = [];
  const assistantFetch = async (url, options = {}) => {
    const body = options.body ? JSON.parse(options.body) : null;
    requests.push({ url, body });
    if (url.endsWith("/api/tags")) return Response.json({ models: [...installed].map((name) => ({ name })) });
    if (url.endsWith("/api/show")) return installed.has(body.model)
      ? Response.json({ capabilities: ["completion", "tools"], ...(remoteCustom && body.model === "custom-agent:latest" ? { remote_host: "https://ollama.com" } : {}) }) : new Response("{}", { status: 404 });
    if (url.endsWith("/api/pull")) {
      installed.add(body.model);
      return new Response('{"status":"pulling","digest":"sha256:123","total":100,"completed":100}\n{"status":"success"}\n');
    }
    if (url.endsWith("/api/chat")) return Response.json({ message: { content: "Ready" } });
    throw new Error(`Unexpected endpoint: ${url}`);
  };
  let app;
  async function launch() {
    app = await createApp({ dataDir, seed: false, accessToken: "setup-session", assistantFetch });
    await new Promise((resolve) => app.server.listen(0, "127.0.0.1", resolve));
  }
  await launch();
  t.after(async () => { await app.close(); await rm(dataDir, { recursive: true, force: true }); });
  async function request(route, method = "GET", body, authenticated = true) {
    const response = await fetch(`http://127.0.0.1:${app.server.address().port}${route}`, {
      method,
      headers: { ...(authenticated ? { cookie: "sidequest_session=setup-session" } : {}), ...(body ? { "content-type": "application/json" } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    });
    return { status: response.status, body: await response.json() };
  }
  for (const [route, method, body] of [
    ["/api/assistant", "GET"],
    ["/api/assistant/setup", "POST", { action: "runtime" }],
    ["/api/assistant/setup", "DELETE"],
    ["/api/assistant/model", "PATCH", { model: "qwen3.5:4b" }],
  ]) assert.equal((await request(route, method, body, false)).status, 403);
  assert.equal(requests.length, 0);
  const status = await request("/api/assistant");
  assert.equal(status.body.ready, true);
  assert.equal(status.body.model, "qwen3.5:9b");
  assert.equal((await request("/api/assistant/setup", "POST", { action: "model", model: "arbitrary:cloud" })).status, 400);
  assert.equal((await request("/api/assistant/model", "PATCH", { model: "qwen3.5:4b" })).status, 409);
  assert.equal((await request("/api/assistant/model", "PATCH", { model: "qwen3.5:9b", url: "https://example.com" })).status, 400);
  assert.equal((await request("/api/assistant/setup", "POST", { action: "model", model: "qwen3.5:4b" })).status, 202);
  let finished;
  for (let attempt = 0; attempt < 60; attempt++) {
    finished = (await request("/api/assistant")).body;
    if (finished.task?.phase === "complete" || finished.task?.phase === "error") break;
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  assert.equal(finished.task.phase, "complete");
  assert.equal(finished.ready, true);
  assert.equal(finished.model, "qwen3.5:4b");
  assert.equal((await request("/api/assistant/plan", "POST", { message: "What can you do?", date: "2026-11-01" })).status, 200);
  assert.equal(requests.findLast((item) => item.url.endsWith("/api/chat")).body.model, "qwen3.5:4b");
  await app.close();
  await launch();
  assert.equal((await request("/api/assistant")).body.model, "qwen3.5:4b");
  assert.equal((await request("/api/assistant/model", "PATCH", { model: "custom-agent:latest" })).body.model, "custom-agent:latest");
  const command = { message: "List my projects", date: "2026-11-01" };
  assert.equal((await request("/api/assistant/plan", "POST", command)).status, 200);
  assert.equal(requests.findLast((item) => item.url.endsWith("/api/chat")).body.model, "custom-agent:latest");
  await app.close();
  await launch();
  assert.equal((await request("/api/assistant")).body.model, "custom-agent:latest");
  remoteCustom = true;
  const chatCount = requests.filter(item => item.url.endsWith("/api/chat")).length;
  assert.equal((await request("/api/assistant/plan", "POST", command)).status, 409);
  assert.equal(requests.filter(item => item.url.endsWith("/api/chat")).length, chatCount);
});
