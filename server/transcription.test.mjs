import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { spawn } from 'node:child_process';
import { mkdtemp, mkdir, writeFile, readFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createTranscriber, validateDictationWav } from './transcription.mjs';

const modelBytes = Buffer.from('verified local transcription test model');
const model = {
  url: 'https://model.invalid/fixture', size: modelBytes.length,
  sha256: createHash('sha256').update(modelBytes).digest('hex'),
};
function wav({ seconds = 0.4, silent = false } = {}) {
  const length = Math.floor(seconds * 16000);
  const buffer = Buffer.alloc(44 + length * 2);
  buffer.write('RIFF'); buffer.writeUInt32LE(buffer.length - 8, 4); buffer.write('WAVEfmt ', 8);
  buffer.writeUInt32LE(16, 16); buffer.writeUInt16LE(1, 20); buffer.writeUInt16LE(1, 22);
  buffer.writeUInt32LE(16000, 24); buffer.writeUInt32LE(32000, 28); buffer.writeUInt16LE(2, 32); buffer.writeUInt16LE(16, 34);
  buffer.write('data', 36); buffer.writeUInt32LE(length * 2, 40);
  if (!silent) for (let i = 0; i < length; i++) buffer.writeInt16LE(Math.round(Math.sin(i * 0.1) * 2000), 44 + i * 2);
  return buffer;
}
async function setup(t, { preload = true, ...options } = {}) {
  const root = await mkdtemp(path.join(tmpdir(), 'projector-transcription-test-'));
  const directory = path.join(root, 'models');
  await mkdir(directory);
  if (preload) await writeFile(path.join(directory, 'ggml-base.bin'), modelBytes);
  const transcriber = createTranscriber({ directory, executable: process.execPath, model,
    fetchImpl: async () => { throw new Error('Audio must never be sent to a network service'); }, ...options });
  t.after(async () => { await transcriber.close(); await rm(root, { recursive: true, force: true }); });
  return { root, directory, transcriber };
}
async function waitUntil(check) {
  for (let i = 0; i < 200; i++) {
    if (await check()) return;
    await new Promise(resolve => setTimeout(resolve, 5));
  }
  assert.fail('Operation did not reach the expected state');
}

test('WAV validation rejects incompatible formats, truncated data, long recordings and silence', () => {
  assert.doesNotThrow(() => validateDictationWav(wav()));
  for (const mutate of [
    buffer => buffer.writeUInt16LE(2, 22),
    buffer => buffer.writeUInt32LE(48000, 24),
    buffer => buffer.writeUInt16LE(32, 34),
    buffer => buffer.writeUInt32LE(17, 16),
    buffer => buffer.writeUInt32LE(12, 40),
  ]) {
    const buffer = wav(); mutate(buffer);
    assert.throws(() => validateDictationWav(buffer), error => error.status === 400);
  }
  for (const buffer of [Buffer.alloc(10), wav({ seconds: 121 }), wav().subarray(0, 100)]) {
    assert.throws(() => validateDictationWav(buffer), error => error.status === 400);
  }
  assert.throws(() => validateDictationWav(wav({ silent: true })), error => error.status === 422);
});

test('readiness verifies the cached model and reports unsupported or missing engines', async t => {
  const { transcriber, directory } = await setup(t);
  assert.equal((await transcriber.status()).ready, true);
  const unsupported = createTranscriber({ directory, executable: path.join(directory, 'missing.exe'), model });
  assert.equal((await unsupported.status()).supported, false);
  await assert.rejects(unsupported.transcribe(wav()), error => error.status === 503);
  await unsupported.close();
  await writeFile(path.join(directory, 'ggml-base.bin'), Buffer.alloc(model.size, 1));
  const corrupted = createTranscriber({ directory, executable: process.execPath, model });
  assert.equal((await corrupted.status()).ready, false);
  await assert.rejects(corrupted.transcribe(wav()), error => error.status === 409);
  await corrupted.close();
});

test('model download verifies its digest and atomically replaces the model', async t => {
  const { transcriber, directory } = await setup(t, { preload: false,
    fetchImpl: async url => { assert.equal(url, model.url); return new Response(modelBytes); } });
  assert.equal((await transcriber.status()).ready, false);
  await transcriber.startDownload();
  await waitUntil(async () => (await transcriber.status()).ready);
  assert.deepEqual(await readFile(path.join(directory, 'ggml-base.bin')), modelBytes);
  assert.deepEqual(await readdir(directory), ['ggml-base.bin']);
});

test('digest mismatch never promotes downloaded bytes into a usable model', async t => {
  const { transcriber, directory } = await setup(t, { preload: false,
    fetchImpl: async () => new Response(Buffer.alloc(model.size, 1)) });
  await transcriber.startDownload();
  await waitUntil(async () => (await transcriber.status()).phase === 'error');
  await transcriber.cancelDownload();
  const status = await transcriber.status();
  assert.equal(status.ready, false);
  assert.match(status.error, /проверку/);
  assert.deepEqual(await readdir(directory), []);
});

test('cancelling model download removes partial data and permits retry', async t => {
  let attempts = 0;
  const { transcriber, directory } = await setup(t, { preload: false,
    fetchImpl: async (_url, { signal }) => {
      if (++attempts > 1) return new Response(modelBytes);
      return new Response(new ReadableStream({ start(controller) {
        controller.enqueue(modelBytes.subarray(0, 4));
        signal.addEventListener('abort', () => controller.error(signal.reason), { once: true });
      } }));
    } });
  await transcriber.startDownload();
  await waitUntil(async () => (await transcriber.status()).received === 4);
  await transcriber.cancelDownload();
  assert.equal((await transcriber.status()).phase, 'idle');
  assert.deepEqual(await readdir(directory), []);
  await transcriber.startDownload();
  await waitUntil(async () => (await transcriber.status()).ready);
});

test('local CLI receives fixed safe arguments, returns UTF-8 text and deletes temporary audio', async t => {
  let root;
  let called = false;
  const { transcriber, directory, root: testRoot } = await setup(t, { spawnImpl(executable, args, options) {
    called = true;
    assert.equal(executable, process.execPath);
    assert.equal(options.shell, false);
    assert.equal(options.windowsHide, true);
    assert.equal(args[args.indexOf('-l') + 1], 'ru');
    assert.equal(args[args.indexOf('-m') + 1], path.join(directory, 'ggml-base.bin'));
    assert.ok(args.includes('-ng'));
    return spawn(process.execPath, [path.join(root, 'recognizer.mjs'), ...args], options);
  } });
  root = testRoot;
  await writeFile(path.join(root, 'recognizer.mjs'), `import fs from 'node:fs'; const args=process.argv.slice(2); fs.writeFileSync(args[args.indexOf('-of')+1]+'.txt','\uFEFF  Проверка локальной диктовки.  ');`);
  assert.equal(await transcriber.transcribe(wav(), { language: 'ru' }), 'Проверка локальной диктовки.');
  assert.equal(called, true);
  assert.equal((await transcriber.status()).busy, false);
  assert.deepEqual(await readdir(directory), ['ggml-base.bin']);
});

test('only one local job runs; cancellation waits for process exit and removes its files', async t => {
  let root;
  let markStarted;
  const started = new Promise(resolve => { markStarted = resolve; });
  const { transcriber, directory, root: testRoot } = await setup(t, { spawnImpl(executable, args, options) {
    const child = spawn(executable, [path.join(root, 'waiting.mjs'), ...args], options);
    child.once('spawn', markStarted);
    return child;
  } });
  root = testRoot;
  await writeFile(path.join(root, 'waiting.mjs'), 'setTimeout(()=>{},10000);');
  const controller = new AbortController();
  const cancelled = assert.rejects(transcriber.transcribe(wav(), { signal: controller.signal }), error => error.status === 499);
  await started;
  assert.equal((await transcriber.status()).busy, true);
  await assert.rejects(transcriber.transcribe(wav()), error => error.status === 409);
  controller.abort();
  await cancelled;
  assert.equal((await transcriber.status()).busy, false);
  assert.deepEqual(await readdir(directory), ['ggml-base.bin']);
});

test('recognizer timeout terminates the job and cleans private temporary files', async t => {
  const { transcriber, root, directory } = await setup(t, { timeoutMs: 30,
    spawnImpl(executable, _args, options) { return spawn(executable, [path.join(root, 'waiting.mjs')], options); } });
  await writeFile(path.join(root, 'waiting.mjs'), 'setTimeout(()=>{},10000);');
  await assert.rejects(transcriber.transcribe(wav()), error => error.status === 504);
  assert.deepEqual(await readdir(directory), ['ggml-base.bin']);
});
