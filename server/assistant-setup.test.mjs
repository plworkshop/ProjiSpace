import test from "node:test";
import assert from "node:assert/strict";
import { createAssistantSetup } from "./assistant-setup.mjs";

const json = body => new Response(JSON.stringify(body), { headers: { "content-type": "application/json" } });
async function until(condition) {
  for (let i = 0; i < 100; i++) {
    if (await condition()) return;
    await new Promise(resolve => setTimeout(resolve, 2));
  }
  assert.fail("Setup did not reach the expected state");
}
function fixture(options = {}) {
  let saved = options.saved ?? null;
  let running = options.running ?? true;
  const installed = new Set(options.installed || []);
  const requests = [];
  const runtime = options.runtime || {
    inspect: async () => ({ installed: true, canInstall: true }),
    ensure: async () => { running = true; },
  };
  const setup = createAssistantSetup({
    getModel: () => saved,
    setModel: id => { saved = id; },
    runtime,
    fetchImpl: async (url, init) => {
      assert.ok(url.startsWith("http://127.0.0.1:11434/api/"));
      assert.equal(init.redirect, "error");
      requests.push({ url, ...init });
      if (!running) throw new Error("Offline");
      const body = init.body ? JSON.parse(init.body) : null;
      if (url.endsWith("/tags")) return json({ models: [...installed].map(name => ({ name })) });
      if (url.endsWith("/show")) return json(options.details?.(body.model) || { capabilities: installed.has(body.model) ? ["tools"] : [] });
      if (url.endsWith("/pull")) {
        if (options.pull) return options.pull(body.model, init.signal, installed);
        installed.add(body.model);
        return new Response('{"status":"pulling","digest":"sha256:abc","total":100,"completed":100}\n{"status":"success"}\n');
      }
      throw new Error("Unexpected endpoint");
    },
  });
  return { setup, requests, installed, saved: () => saved };
}
test("setup detects installed models without downloading, preserves the saved model and prefers existing 9b", async () => {
  const existing = fixture({ installed: ["qwen3.5:9b", "qwen3.5:4b"] });
  assert.equal((await existing.setup.status()).model, "qwen3.5:9b");
  assert.equal((await existing.setup.status()).ready, true);
  assert.ok(existing.requests.every(item => !item.url.endsWith("/pull")));
  const saved = fixture({ installed: ["qwen3.5:9b", "qwen3.5:4b"], saved: "qwen3.5:4b" });
  assert.equal((await saved.setup.status()).model, "qwen3.5:4b");
  const switched = await saved.setup.select("qwen3.5:9b");
  assert.equal(saved.saved(), "qwen3.5:9b");
  assert.equal(switched.model, "qwen3.5:9b");
  assert.equal(switched.ready, true);
});
test("polling coalesces inspection while existing runtime and model setup remain repeatable", async () => {
  const { setup, requests } = fixture({ installed: ["qwen3.5:9b"] });
  await Promise.all(Array.from({ length: 5 }, () => setup.status()));
  assert.equal(requests.filter(item => item.url.endsWith("/tags")).length, 1);
  assert.equal(requests.filter(item => item.url.endsWith("/show")).length, 1);
  await setup.start({ action: "runtime" });
  await until(() => !setup.busy());
  await setup.start({ action: "model", model: "qwen3.5:9b" });
  await until(() => !setup.busy());
  assert.equal((await setup.status()).ready, true);
  assert.ok(requests.every(item => !item.url.endsWith("/pull")));
});
test("setup rejects unknown models and selecting missing models, without network downloads", async () => {
  const { setup, requests } = fixture();
  await assert.rejects(setup.start({ action: "model", model: "arbitrary/cloud" }), /ai_setup_invalid/);
  await assert.rejects(setup.select("qwen3.5:4b"), /ai_setup_model/);
  await assert.rejects(setup.select("constructor"), /ai_setup_model/);
  assert.ok(requests.every(item => !item.url.endsWith("/pull")));
});
test("model pull aggregates layers, verifies tools support and selects only after success", async () => {
  let enqueue, finish;
  const { setup, saved, installed } = fixture({
    pull: async () => new Response(new ReadableStream({ start(stream) {
      enqueue = text => stream.enqueue(new TextEncoder().encode(text));
      finish = () => stream.close();
    } })),
  });
  const started = await setup.start({ action: "model", model: "qwen3.5:4b" });
  assert.ok(["starting", "downloading_model"].includes(started.task.phase));
  await until(() => !!enqueue);
  enqueue('{"digest":"a","total":100,"completed":100}\n{"digest":"b","total":50,"completed":10}\n');
  await until(async () => (await setup.status()).task.completed === 110);
  assert.equal((await setup.status()).task.total, 150);
  assert.equal(saved(), null);
  installed.add("qwen3.5:4b");
  enqueue('{"digest":"b","total":50,"completed":50}\n{"status":"success"}\n');
  finish();
  await until(async () => (await setup.status()).task.phase === "complete");
  assert.equal(saved(), "qwen3.5:4b");
  assert.equal((await setup.status()).ready, true);
  await setup.close();
});
test("cancellation aborts a pull, keeps the installed model and allows a resumable retry", async () => {
  let attempts = 0;
  const { setup, saved, installed } = fixture({ installed: ["qwen3.5:9b"], saved: "qwen3.5:9b",
    pull: async (model, signal) => {
      attempts++;
      if (attempts === 1) return new Response(new ReadableStream({ start(stream) {
        signal.addEventListener("abort", () => stream.error(signal.reason), { once: true });
      } }));
      installed.add(model);
      return new Response('{"status":"success"}\n');
    },
  });
  await setup.start({ action: "model", model: "qwen3.5:4b" });
  await until(() => attempts === 1);
  await assert.rejects(setup.start({ action: "model", model: "qwen3.5:4b" }), /ai_setup_busy/);
  assert.equal((await setup.cancel()).task.phase, "cancelled");
  assert.equal(saved(), "qwen3.5:9b");
  assert.ok(installed.has("qwen3.5:9b"));
  await setup.start({ action: "model", model: "qwen3.5:4b" });
  await until(async () => (await setup.status()).task.phase === "complete");
  assert.equal(attempts, 2);
  assert.equal(saved(), "qwen3.5:4b");
});
test("interrupted, malformed or incompatible pulls never mark a model ready", async () => {
  for (const stream of ['{"status":"pulling"}\n', 'not JSON\n', '{"error":"disk full"}\n', '{"digest":"x","total":-1}\n', '{"status":"success"}\n']) {
    const { setup, saved } = fixture({ pull: async () => new Response(stream) });
    await setup.start({ action: "model", model: "qwen3.5:4b" });
    await until(async () => (await setup.status()).task.phase === "error");
    assert.equal(saved(), null);
    assert.equal((await setup.status()).ready, false);
  }
});
test("offline runtime setup is explicit, starts existing Ollama and does not pull a model", async () => {
  const { setup, requests } = fixture({ running: false });
  assert.equal((await setup.status()).runtime.running, false);
  assert.equal(requests.length, 1);
  await setup.start({ action: "runtime" });
  await until(async () => (await setup.status()).task.phase === "complete");
  assert.equal((await setup.status()).runtime.running, true);
  assert.equal((await setup.status()).ready, false);
  assert.ok(requests.every(item => !item.url.endsWith("/pull")));
});
test("installer cannot be cancelled midway; shutdown waits for the owned installation to settle", async () => {
  let release;
  const { setup } = fixture({ running: false, runtime: {
    inspect: async () => ({ installed: false, canInstall: true }),
    ensure: async ({ signal, onProgress }) => {
      onProgress({ phase: "installing", completed: 0, total: 0, cancellable: false });
      await new Promise(resolve => { release = resolve; });
      signal.throwIfAborted();
    },
  } });
  await setup.start({ action: "runtime" });
  await until(() => !!release);
  await assert.rejects(setup.cancel(), /ai_setup_cancel/);
  let closed = false;
  const closing = setup.close().then(() => { closed = true; });
  await new Promise(resolve => setTimeout(resolve, 5));
  assert.equal(closed, false);
  release();
  await closing;
  assert.equal(closed, true);
  assert.equal((await setup.status()).task.phase, "cancelled");
  await assert.rejects(setup.start({ action: "runtime" }), /ai_setup_closed/);
});
test("shutdown aborts an active model download without deleting installed models", async () => {
  let signal;
  const { setup, installed } = fixture({ installed: ["qwen3.5:9b"], pull: async (_model, abort) => {
    signal = abort;
    return new Response(new ReadableStream({ start(stream) {
      abort.addEventListener("abort", () => stream.error(abort.reason), { once: true });
    } }));
  } });
  await setup.start({ action: "model", model: "qwen3.5:4b" });
  await until(() => !!signal);
  await setup.close();
  assert.equal(signal.aborted, true);
  assert.equal(setup.busy(), false);
  assert.ok(installed.has("qwen3.5:9b"));
});

test("installed custom models are discovered, verified and selected without downloading", async () => {
  const { setup, saved, requests } = fixture({ installed: ["qwen3.5:9b", "my-agent:latest", "embed:latest", "remote:latest"],
    details: id => id === "embed:latest" ? { capabilities: ["embedding"] }
      : id === "remote:latest" ? { capabilities: ["tools"], remote_host: "https://ollama.com", remote_model: "upstream" }
        : { capabilities: ["completion", "tools"] },
  });
  const status = await setup.status();
  const custom = status.models.find(item => item.id === "my-agent:latest");
  assert.equal(custom.installed, true);
  assert.equal(custom.supported, true);
  assert.equal(custom.recommended, false);
  assert.equal(status.models.find(item => item.id === "embed:latest").reason, "tools");
  assert.equal(status.models.find(item => item.id === "remote:latest").reason, "remote");
  await assert.rejects(setup.select("embed:latest"), /ai_setup_model/);
  await assert.rejects(setup.select("remote:latest"), /ai_setup_model/);
  const selected = await setup.select("my-agent:latest");
  assert.equal(selected.model, "my-agent:latest");
  assert.equal(selected.ready, true);
  assert.equal(saved(), "my-agent:latest");
  assert.equal(await setup.inferenceModel(), "my-agent:latest");
  await assert.rejects(setup.start({ action: "model", model: "my-agent:latest" }), /ai_setup_invalid/);
  assert.ok(requests.every(item => !item.url.endsWith("/pull")));
  const restarted = fixture({ installed: ["qwen3.5:9b", "my-agent:latest"], saved: saved() });
  assert.equal((await restarted.setup.status()).model, "my-agent:latest");
  assert.equal((await restarted.setup.status()).ready, true);
});

test("inference rechecks a selected model before project data can be sent", async () => {
  let detail = { capabilities: ["tools"] };
  const { setup } = fixture({ installed: ["custom:latest"], saved: "custom:latest", details: () => {
    if (!detail) throw new Error("Offline");
    return detail;
  } });
  assert.equal((await setup.status()).ready, true);
  assert.equal(await setup.inferenceModel(), "custom:latest");
  detail = { capabilities: ["tools"], remote_model: "cloud-upstream" };
  await assert.rejects(setup.inferenceModel(), /ai_setup_model/);
  detail = { capabilities: ["completion"] };
  await assert.rejects(setup.inferenceModel(), /ai_setup_model/);
  detail = null;
  await assert.rejects(setup.inferenceModel(), /ai_unavailable/);
});
