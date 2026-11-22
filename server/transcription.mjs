import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { mkdir, mkdtemp, open, readFile, rename, rm, stat, unlink } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { availableParallelism } from 'node:os';
import path from 'node:path';

export const dictationModel = {
  url: 'https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-base.bin',
  size: 147951465,
  sha256: '60ed5bc3dd14eea856493d334349b405782ddcaf0028d4b5df4088345fba2efe',
};

function failure(status, message) { return Object.assign(new Error(message), { status }); }

export function validateDictationWav(buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.length < 6444 || buffer.length > 44 + 120 * 32000 ||
    buffer.toString('ascii', 0, 4) !== 'RIFF' || buffer.readUInt32LE(4) !== buffer.length - 8 ||
    buffer.toString('ascii', 8, 16) !== 'WAVEfmt ' || buffer.readUInt32LE(16) !== 16 ||
    buffer.readUInt16LE(20) !== 1 || buffer.readUInt16LE(22) !== 1 ||
    buffer.readUInt32LE(24) !== 16000 || buffer.readUInt32LE(28) !== 32000 ||
    buffer.readUInt16LE(32) !== 2 || buffer.readUInt16LE(34) !== 16 ||
    buffer.toString('ascii', 36, 40) !== 'data' || buffer.readUInt32LE(40) !== buffer.length - 44 ||
    (buffer.length - 44) % 2) {
    throw failure(400, 'Нужна запись WAV до двух минут: моно, 16 кГц, 16 бит.');
  }
  let energy = 0;
  for (let i = 44; i < buffer.length; i += 2) energy += buffer.readInt16LE(i) ** 2;
  if (Math.sqrt(energy / ((buffer.length - 44) / 2)) < 40) {
    throw failure(422, 'Не удалось услышать речь. Попробуйте ещё раз.');
  }
}

export function createTranscriber({ directory, executable, model = dictationModel, fetchImpl = fetch, spawnImpl = spawn, timeoutMs = 180000 }) {
  const modelPath = path.join(directory, 'ggml-base.bin');
  const partialPath = `${modelPath}.part`;
  let supported = false;
  let ready = false;
  let phase = 'idle';
  let received = 0;
  let error = null;
  let closed = false;
  let downloadController;
  let downloadTask;
  let jobController;
  let jobTask;
  const initialization = (async () => {
    supported = !!executable && await stat(executable).then(file => file.isFile(), () => false);
    if (!supported) return;
    const file = await stat(modelPath).catch(() => null);
    if (file?.size !== model.size) return;
    const hash = createHash('sha256');
    for await (const chunk of createReadStream(modelPath)) hash.update(chunk);
    ready = hash.digest('hex') === model.sha256;
    if (ready) received = model.size;
  })().catch(() => {
    ready = false;
    phase = 'error';
    error = 'Не удалось прочитать модель. Повторите загрузку.';
  });

  async function status() {
    await initialization;
    return { supported, ready, phase, received, total: model.size, busy: !!jobTask, error };
  }

  async function startDownload() {
    await initialization;
    if (closed || !supported) throw failure(503, 'Локальное распознавание недоступно в этой версии приложения.');
    if (ready || downloadTask) return;
    if (jobTask) throw failure(409, 'Дождитесь окончания распознавания.');
    phase = 'downloading';
    error = null;
    received = 0;
    const controller = new AbortController();
    downloadController = controller;
    downloadTask = (async () => {
      let file;
      try {
        await mkdir(directory, { recursive: true });
        const downloadSignal = AbortSignal.any([controller.signal, AbortSignal.timeout(600000)]);
        const response = await fetchImpl(model.url, { signal: downloadSignal });
        if (!response.ok || !response.body) throw new Error('Download failed');
        const expected = response.headers.get('content-length');
        if (expected && Number(expected) !== model.size) throw new Error('Unexpected model size');
        file = await open(partialPath, 'w', 0o600);
        const hash = createHash('sha256');
        for await (const value of response.body) {
          downloadSignal.throwIfAborted();
          const chunk = Buffer.from(value);
          received += chunk.length;
          if (received > model.size) throw new Error('Model too large');
          hash.update(chunk);
          await file.writeFile(chunk);
        }
        downloadSignal.throwIfAborted();
        if (received !== model.size || hash.digest('hex') !== model.sha256) {
          throw failure(502, 'Загруженная модель не прошла проверку. Повторите загрузку.');
        }
        await file.close();
        file = null;
        await rename(partialPath, modelPath);
        ready = true;
        phase = 'idle';
      } catch (cause) {
        phase = controller.signal.aborted ? 'idle' : 'error';
        error = controller.signal.aborted ? null : cause.status ? cause.message : 'Не удалось скачать модель. Попробуйте ещё раз.';
      } finally {
        await file?.close();
        await unlink(partialPath).catch(() => {});
        downloadController = null;
        downloadTask = null;
      }
    })();
  }

  async function cancelDownload() {
    downloadController?.abort();
    await downloadTask;
  }

  async function transcribe(buffer, { signal, language = 'auto' } = {}) {
    await initialization;
    if (closed || !supported) throw failure(503, 'Локальное распознавание недоступно в этой версии приложения.');
    if (!ready) throw failure(409, 'Сначала скачайте модель распознавания.');
    if (jobTask) throw failure(409, 'Дождитесь окончания распознавания.');
    if (!['auto', 'ru', 'en'].includes(language)) throw failure(400, 'Неизвестный язык распознавания.');
    validateDictationWav(buffer);
    const controller = new AbortController();
    const combined = signal ? AbortSignal.any([signal, controller.signal]) : controller.signal;
    jobController = controller;
    jobTask = (async () => {
      let temporary;
      let timedOut = false;
      try {
        combined.throwIfAborted();
        temporary = await mkdtemp(path.join(directory, 'recording-'));
        const wav = path.join(temporary, 'recording.wav');
        const output = path.join(temporary, 'transcript');
        await writeAudio(wav, buffer);
        combined.throwIfAborted();
        await new Promise((resolve, reject) => {
          const child = spawnImpl(executable, [
            '-m', modelPath, '-f', wav, '-l', language, '-otxt', '-of', output,
            '-np', '-nt', '-ng', '-t', String(Math.min(4, availableParallelism())), '-bs', '1', '-bo', '1',
          ], { shell: false, windowsHide: true, stdio: ['ignore', 'ignore', 'ignore'], signal: combined });
          const timer = setTimeout(() => { timedOut = true; controller.abort(); }, timeoutMs);
          let launchError;
          child.once('error', cause => {
            launchError = cause;
            if (!child.pid) { clearTimeout(timer); reject(cause); }
          });
          child.once('close', code => {
            clearTimeout(timer);
            if (combined.aborted) reject(combined.reason);
            else if ([0xC0000135, 0xC0000139, -1073741515, -1073741511].includes(code)) reject(failure(503, 'Для голосового ввода нужен Microsoft Visual C++ Redistributable x64.'));
            else if (launchError || code !== 0) reject(launchError || new Error('Recognizer failed'));
            else resolve();
          });
        });
        combined.throwIfAborted();
        const text = (await readFile(`${output}.txt`, 'utf8')).replace(/^\uFEFF/, '').trim();
        if (!text || /^\[(?:BLANK_AUDIO|SILENCE)\]$/i.test(text)) throw failure(422, 'Не удалось услышать речь. Попробуйте ещё раз.');
        return text;
      } catch (cause) {
        if (timedOut) throw failure(504, 'Распознавание заняло слишком много времени. Попробуйте более короткую запись.');
        if (combined.aborted) throw failure(499, 'Распознавание отменено.');
        if (cause.status) throw cause;
        throw failure(502, 'Не удалось распознать запись. Попробуйте ещё раз.');
      } finally {
        if (temporary) await rm(temporary, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
      }
    })();
    try { return await jobTask; }
    finally { jobTask = null; jobController = null; }
  }

  async function close() {
    closed = true;
    downloadController?.abort();
    jobController?.abort();
    await Promise.allSettled([downloadTask, jobTask].filter(Boolean));
  }
  return { status, startDownload, cancelDownload, transcribe, close };
}

async function writeAudio(filePath, buffer) {
  const file = await open(filePath, 'w', 0o600);
  try { await file.writeFile(buffer); }
  finally { await file.close(); }
}
