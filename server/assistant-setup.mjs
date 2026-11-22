const ORIGIN = "http://127.0.0.1:11434";
export const assistantModels = [
  { id: "qwen3.5:4b", sizeBytes: 3_400_000_000 },
  { id: "qwen3.5:9b", sizeBytes: 6_600_000_000 },
];
const failure = (code, status = 502) => Object.assign(new Error(code), { status });
const allowed = model => assistantModels.some(item => item.id === model);
const validName = model => typeof model === "string" && /^[a-z0-9][a-z0-9._:/-]{0,239}$/i.test(model);
const remote = data => !!(data.remote_host || data.remote_model);

export function createAssistantSetup({
  fetchImpl = fetch,
  getModel = () => null,
  setModel = () => {},
  runtime = null,
} = {}) {
  let task = null;
  let work = null;
  let controller = null;
  let closed = false;
  let inspection = null;
  let inspectedAt = 0;
  let selected = validName(getModel()) ? getModel() : "qwen3.5:4b";
  let snapshot = { ready: false, model: selected, runtime: { installed: false, running: false, canInstall: !!runtime },
    models: assistantModels.map(item => ({ ...item, installed: false, supported: true, recommended: true })) };
  const model = () => selected;
  async function request(endpoint, body, signal = AbortSignal.timeout(4000)) {
    const response = await fetchImpl(ORIGIN + endpoint, {
      method: body ? "POST" : "GET", redirect: "error", signal,
      headers: body ? { "Content-Type": "application/json" } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    });
    if (!response.ok) throw failure(response.status === 404 ? "ai_model" : "ai_unavailable", 503);
    return response;
  }
  async function inspect() {
    const local = runtime ? await runtime.inspect() : { installed: false, canInstall: false };
    let running = false;
    let installed = [];
    try {
      const data = await (await request("/api/tags")).json();
      running = true;
      installed = Array.isArray(data.models) ? data.models.filter(item => validName(item?.name)) : [];
    } catch { /* A stopped or absent runtime is an expected setup state. */ }
    const catalog = assistantModels.map(item => ({ ...item, recommended: true }));
    for (const item of installed) {
      if (!catalog.some(model => model.id === item.name)) catalog.push({ id: item.name, sizeBytes: 0, recommended: false });
    }
    const models = await Promise.all(catalog.map(async item => {
      const tag = installed.find(model => model.name === item.id);
      let supported = !tag, reason;
      if (tag) {
        try {
          const data = await (await request("/api/show", { model: item.id })).json();
          reason = remote(tag) || remote(data) ? "remote" : data.capabilities?.includes("tools") ? undefined : "tools";
          supported = !reason;
        } catch { reason = "unavailable"; }
      }
      return { ...item, sizeBytes: Number.isSafeInteger(tag?.size) && tag.size >= 0 ? tag.size : item.sizeBytes,
        installed: !!tag, supported, ...(reason ? { reason } : {}) };
    }));
    if (!validName(getModel())) {
      selected = models.find(item => item.id === "qwen3.5:9b" && item.installed && item.supported)?.id ||
        models.find(item => item.installed && item.supported)?.id || "qwen3.5:4b";
    }
    snapshot = { ready: models.some(item => item.id === selected && item.installed && item.supported), model: selected,
      runtime: { installed: local.installed || running, running, canInstall: local.canInstall }, models };
    inspectedAt = Date.now();
    return snapshot;
  }
  async function refresh(force = false) {
    if (!force && inspectedAt && Date.now() - inspectedAt < 2000) return;
    if (!inspection) inspection = inspect().finally(() => { inspection = null; });
    await inspection;
  }
  async function status() {
    await refresh();
    return { ...snapshot, task: task ? { ...task } : null };
  }
  async function waitUntilRunning(signal) {
    const deadline = Date.now() + 30_000;
    while (true) {
      signal.throwIfAborted();
      try { await request("/api/tags", null, AbortSignal.any([signal, AbortSignal.timeout(2000)])); return; }
      catch { if (Date.now() >= deadline) throw failure("ai_unavailable", 503); }
      await new Promise((resolve, reject) => {
        const timer = setTimeout(done, 500);
        function done() { signal.removeEventListener("abort", aborted); resolve(); }
        function aborted() { clearTimeout(timer); reject(signal.reason); }
        signal.addEventListener("abort", aborted, { once: true });
        if (signal.aborted) aborted();
      });
    }
  }
  async function pull(id, signal) {
    task = { phase: "downloading_model", model: id, completed: 0, total: 0, cancellable: true };
    const response = await request("/api/pull", { model: id, stream: true }, signal);
    if (!response.body) throw failure("ai_setup_download");
    const decoder = new TextDecoder();
    const layers = new Map();
    let buffer = "", received = 0, success = false;
    function update(line) {
      if (!line.trim()) return;
      let data;
      try { data = JSON.parse(line); } catch { throw failure("ai_setup_download"); }
      if (data.error) throw failure("ai_setup_download");
      if (data.digest) {
        if (typeof data.digest !== "string" || data.digest.length > 160 || layers.size > 128 ||
          !Number.isSafeInteger(data.total) || data.total < 0 || data.total > 20 * 1024 ** 3 ||
          data.completed !== undefined && (!Number.isSafeInteger(data.completed) || data.completed < 0 || data.completed > data.total))
          throw failure("ai_setup_download");
        const previous = layers.get(data.digest);
        layers.set(data.digest, { total: data.total, completed: data.completed ?? previous?.completed ?? 0 });
        task.total = [...layers.values()].reduce((sum, item) => sum + item.total, 0);
        task.completed = [...layers.values()].reduce((sum, item) => sum + item.completed, 0);
        if (task.total > 20 * 1024 ** 3) throw failure("ai_setup_download");
      }
      if (data.status === "success") success = true;
      if (typeof data.status === "string" && /verifying|writing manifest|removing unused/i.test(data.status))
        task.phase = "checking";
    }
    for await (const chunk of response.body) {
      signal.throwIfAborted();
      received += chunk.length;
      if (received > 32 * 1024 ** 2) throw failure("ai_setup_download");
      buffer += decoder.decode(chunk, { stream: true });
      let end;
      while ((end = buffer.indexOf("\n")) >= 0) {
        if (end > 65536) throw failure("ai_setup_download");
        update(buffer.slice(0, end));
        buffer = buffer.slice(end + 1);
      }
      if (buffer.length > 65536) throw failure("ai_setup_download");
    }
    buffer += decoder.decode();
    update(buffer);
    signal.throwIfAborted();
    if (!success) throw failure("ai_setup_download");
    task.phase = "checking";
    const result = await (await request("/api/show", { model: id }, signal)).json();
    if (remote(result) || !result.capabilities?.includes("tools")) throw failure("ai_setup_model", 409);
    await setModel(id);
    selected = id;
  }
  return {
    status,
    model,
    async inferenceModel(signal) {
      const id = selected;
      try {
        const result = await (await request("/api/show", { model: id }, signal ? AbortSignal.any([signal, AbortSignal.timeout(4000)]) : undefined)).json();
        if (remote(result) || !result.capabilities?.includes("tools")) throw failure("ai_setup_model", 409);
        return id;
      } catch (error) {
        if (error.status) throw error;
        throw failure(signal?.aborted ? "ai_cancelled" : "ai_unavailable", 503);
      }
    },
    busy: () => !!work,
    async start({ action, model: id } = {}) {
      if (closed) throw failure("ai_setup_closed", 503);
      if (!["runtime", "model"].includes(action) || action === "model" && !allowed(id))
        throw failure("ai_setup_invalid", 400);
      if (work) throw failure("ai_setup_busy", 409);
      await refresh();
      if (work) throw failure("ai_setup_busy", 409);
      if (action === "model" && snapshot.models.some(item => item.id === id && item.installed && !item.supported))
        throw failure("ai_setup_model", 409);
      if (!snapshot.runtime.running && !runtime) throw failure("ai_setup_unavailable", 503);
      controller = new AbortController();
      const abort = controller;
      task = { phase: "starting", model: id, completed: 0, total: 0, cancellable: true };
      work = Promise.resolve().then(async () => {
        try {
          if (!snapshot.runtime.running) {
            await runtime.ensure({ signal: abort.signal, onProgress: update => { task = { ...task, ...update }; } });
            task = { ...task, phase: "starting", completed: 0, total: 0, cancellable: true };
            await waitUntilRunning(abort.signal);
          }
          if (action === "model" && !snapshot.models.some(item => item.id === id && item.installed)) {
            const signal = AbortSignal.any([abort.signal, AbortSignal.timeout(2 * 60 * 60 * 1000)]);
            await pull(id, signal);
          } else if (action === "model") {
            await setModel(id);
            selected = id;
          }
          task = { ...task, phase: "complete", cancellable: false };
        } catch (error) {
          task = { ...task, phase: abort.signal.aborted ? "cancelled" : "error", cancellable: false,
            ...(abort.signal.aborted ? {} : { error: error.status ? error.message : "ai_setup_download" }) };
        } finally {
          await refresh(true);
          work = null;
          controller = null;
        }
      });
      return { ...snapshot, task: { ...task } };
    },
    async cancel() {
      if (work && !task.cancellable) throw failure("ai_setup_cancel", 409);
      controller?.abort();
      await work;
      return status();
    },
    async select(id) {
      if (closed) throw failure("ai_setup_closed", 503);
      if (!validName(id)) throw failure("ai_setup_model", 400);
      if (work) throw failure("ai_setup_busy", 409);
      await refresh(true);
      if (work) throw failure("ai_setup_busy", 409);
      if (!snapshot.models.some(item => item.id === id && item.installed && item.supported)) throw failure("ai_setup_model", 409);
      await setModel(id);
      selected = id;
      snapshot = { ...snapshot, model: id, ready: true };
      return status();
    },
    async close() {
      closed = true;
      controller?.abort();
      await work;
    },
  };
}
