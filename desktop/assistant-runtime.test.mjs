import test from "node:test";
import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { mkdtemp, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { createAssistantRuntime } from "./assistant-runtime.mjs";

async function fixture(t, options = {}) {
  const directory = await mkdtemp(path.join(tmpdir(), "proji-runtime-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  let installed = options.installed || false;
  const spawned = [], downloads = [];
  const runtime = createAssistantRuntime({
    directory, platform: "win32", env: { LOCALAPPDATA: directory, PATH: "", SystemRoot: "C:\\Windows" },
    statImpl: async file => ({ isFile: () => installed && file.endsWith("ollama.exe") }),
    downloadLimit: options.downloadLimit || 100,
    fetchImpl: async (url, init) => {
      downloads.push({ url, init });
      return options.download ? options.download(url, init) : new Response("signed-installer", { headers: { "content-length": "16" } });
    },
    spawnImpl: (file, args, init) => {
      spawned.push({ file, args, init });
      const child = new EventEmitter();
      child.stdout = new EventEmitter();
      child.kill = () => {};
      child.unref = () => {};
      queueMicrotask(() => {
        if (file.endsWith("powershell.exe")) {
          if (init.env.PROJISPACE_OLLAMA_PATH) { child.emit("close", options.startExit ?? 0); return; }
          child.stdout.emit("data", Buffer.from(JSON.stringify(options.signature || { Status: "Valid", Subject: "CN=Ollama Inc., O=Ollama Inc." })));
          child.emit("close", 0);
        } else if (file.endsWith("OllamaSetup.exe")) {
          installed = true;
          child.emit("close", options.installExit ?? 0);
        } else child.emit("spawn");
      });
      return child;
    },
  });
  return { runtime, directory, spawned, downloads };
}
test("an existing runtime is started hidden without downloading or touching models", async t => {
  const { runtime, spawned, downloads } = await fixture(t, { installed: true });
  assert.equal((await runtime.inspect()).installed, true);
  await runtime.ensure({ signal: new AbortController().signal, onProgress() {} });
  assert.equal(downloads.length, 0);
  assert.equal(spawned.length, 1);
  assert.ok(spawned[0].file.endsWith("powershell.exe"));
  assert.deepEqual(spawned[0].args.slice(0, 5), ["-NoProfile", "-NonInteractive", "-WindowStyle", "Hidden", "-Command"]);
  assert.match(spawned[0].args.at(-1), /Start-Process .* -ArgumentList 'serve' -WindowStyle Hidden -ErrorAction Stop/);
  assert.ok(spawned[0].init.env.PROJISPACE_OLLAMA_PATH.endsWith("ollama.exe"));
  assert.ok(!spawned[0].args.at(-1).includes(spawned[0].init.env.PROJISPACE_OLLAMA_PATH));
  assert.equal(spawned[0].init.shell, false);
  assert.equal(spawned[0].init.windowsHide, true);
  assert.notEqual(spawned[0].init.detached, true);
  assert.equal(spawned[0].init.env.OLLAMA_HOST, "127.0.0.1:11434");
});
test("macOS reports manual runtime setup and never downloads or launches a Windows installer", async () => {
  const runtime = createAssistantRuntime({
    directory: "/unused", platform: "darwin", env: { PATH: "" },
    statImpl: async () => { throw Object.assign(new Error("not installed"), { code: "ENOENT" }); },
    fetchImpl: async () => { throw new Error("unexpected download"); },
    spawnImpl: () => { throw new Error("unexpected process"); },
  });
  assert.deepEqual(await runtime.inspect(), { installed: false, canInstall: false });
  await assert.rejects(runtime.ensure({ signal: new AbortController().signal, onProgress() {} }),
    error => error.message === "ai_setup_unavailable" && error.status === 503);
});

test("a failed hidden service launcher reports an installation error", async t => {
  const { runtime } = await fixture(t, { installed: true, startExit: 1 });
  await assert.rejects(runtime.ensure({ signal: new AbortController().signal, onProgress() {} }), /ai_setup_install/);
});
test("new runtime verifies the official signed download before installing and cleans temporary files", async t => {
  const { runtime, directory, spawned, downloads } = await fixture(t);
  const phases = [];
  await runtime.ensure({ signal: new AbortController().signal, onProgress: data => phases.push(data) });
  assert.equal(downloads[0].url, "https://ollama.com/download/OllamaSetup.exe");
  assert.equal(downloads[0].init.redirect, "manual");
  assert.deepEqual(spawned[1].args, ["/VERYSILENT", "/NORESTART", "/SP-"]);
  assert.ok(spawned[0].init.env.PROJISPACE_INSTALLER_PATH.endsWith("OllamaSetup.exe"));
  assert.ok(!spawned[0].args.at(-1).includes(directory));
  assert.equal(phases.find(item => item.phase === "installing").cancellable, false);
  assert.deepEqual(await readdir(directory), []);
});
test("unsigned or wrong-publisher installers are rejected before execution", async t => {
  for (const signature of [{ Status: "NotSigned", Subject: "Ollama" }, { Status: "Valid", Subject: "CN=Other Publisher" }]) {
    const { runtime, spawned, directory } = await fixture(t, { signature });
    await assert.rejects(runtime.ensure({ signal: new AbortController().signal, onProgress() {} }), /ai_setup_signature/);
    assert.equal(spawned.length, 1);
    assert.deepEqual(await readdir(directory), []);
  }
});
test("redirects to unofficial hosts, oversized and truncated downloads never reach the installer", async t => {
  for (const download of [
    async () => new Response(null, { status: 302, headers: { location: "https://example.com/setup.exe" } }),
    async () => new Response("too large", { headers: { "content-length": "101" } }),
    async () => new Response("short", { headers: { "content-length": "10" } }),
  ]) {
    const { runtime, spawned, directory } = await fixture(t, { download });
    await assert.rejects(runtime.ensure({ signal: new AbortController().signal, onProgress() {} }), /ai_setup_download/);
    assert.equal(spawned.length, 0);
    assert.deepEqual(await readdir(directory), []);
  }
});
test("download cancellation cleans the partial installer and never starts a process", async t => {
  const controller = new AbortController();
  const { runtime, spawned, directory } = await fixture(t, { download: async () => {
    controller.abort();
    return new Response("signed-installer");
  } });
  await assert.rejects(runtime.ensure({ signal: controller.signal, onProgress() {} }), error => error.name === "AbortError");
  assert.equal(spawned.length, 0);
  assert.deepEqual(await readdir(directory), []);
});
