import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createApp } from './app.mjs';

function protectedDocument(response) {
  assert.equal(response.status, 200);
  assert.match(response.headers.get('content-type'), /text\/html/);
  assert.match(response.headers.get('content-security-policy') || '', /frame-ancestors 'none'/);
  assert.equal(response.headers.get('x-frame-options'), 'DENY');
}

test('built web documents and SPA fallback disallow framing without blocking top-level reads', async t => {
  const directory = await mkdtemp(path.join(tmpdir(), 'projispace-frame-'));
  const app = await createApp({ dataDir: path.join(directory, 'data'), distDir: directory, seed: false });
  t.after(async () => { await app.close(); await rm(directory, { recursive: true, force: true }); });
  await writeFile(path.join(directory, 'index.html'), '<!doctype html><title>Test workspace</title>');
  await new Promise(resolve => app.server.listen(0, '127.0.0.1', resolve));
  const origin = `http://127.0.0.1:${app.server.address().port}`;
  for (const route of ['/', '/project/unknown', '/%70roject/unknown']) {
    const response = await fetch(origin + route);
    protectedDocument(response);
    assert.match(await response.text(), /Test workspace/);
  }
  const response = await fetch(origin + '/', { method: 'HEAD' });
  protectedDocument(response);
  assert.equal(await response.text(), '');
  assert.equal((await fetch(origin + '/api/projects')).status, 200);
});

test('Vite development documents enforce the same anti-framing boundary', async t => {
  const { createServer } = await import('vite');
  const { default: config } = await import('../vite.config.ts');
  const server = await createServer({
    configFile: false,
    // Exercise the real policy middleware; HTML header checks need no JS/CSS transformers.
    plugins: config.plugins.filter(plugin => plugin.name === 'local-frame-protection'),
    optimizeDeps: { noDiscovery: true, include: [] },
    server: { ...config.server, port: 0, strictPort: false, watch: null },
  });
  t.after(async () => { server.httpServer.closeAllConnections(); await server.close(); });
  await server.listen();
  const response = await fetch(`http://127.0.0.1:${server.httpServer.address().port}/`);
  protectedDocument(response);
  assert.match(await response.text(), /ProjiSpace/);
  const cached = await fetch(`http://127.0.0.1:${server.httpServer.address().port}/`, {
    headers: { 'if-none-match': response.headers.get('etag') },
  });
  assert.equal(cached.status, 304);
  assert.match(cached.headers.get('content-security-policy'), /frame-ancestors 'none'/);
  assert.equal(cached.headers.get('x-frame-options'), 'DENY');
});
