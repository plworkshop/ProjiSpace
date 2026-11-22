import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { createApp } from './app.mjs';

async function setup(t, prepare) {
  const dataDir = await mkdtemp(path.join(tmpdir(), 'projector-planning-test-'));
  await prepare?.(dataDir);
  let app;
  let base;
  async function start() {
    app = await createApp({ dataDir, seed: false });
    await new Promise(resolve => app.server.listen(0, '127.0.0.1', resolve));
    base = `http://127.0.0.1:${app.server.address().port}`;
  }
  await start();
  t.after(async () => { await app.close(); await rm(dataDir, { recursive: true, force: true }); });
  const request = async (url, method = 'GET', body) => {
    const response = await fetch(base + url, {
      method, body: body === undefined ? undefined : JSON.stringify(body),
      headers: body === undefined ? {} : { 'content-type': 'application/json' },
    });
    return { status: response.status, body: response.status === 204 ? undefined : await response.json() };
  };
  return {
    request,
    async project(name = 'План проекта', parentId = null) { return (await request('/api/projects', 'POST', { name, parentId })).body; },
    async restart() { await app.close(); await start(); },
    async entries() { return (await request('/api/projects')).body.planningEntries; },
  };
}

test('planning CRUD preserves date-only values, completion and multiline notes across restart', async t => {
  const api = await setup(t);
  const project = await api.project();
  assert.deepEqual(await api.entries(), []);
  const stage = await api.request(`/api/projects/${project.id}/planning`, 'POST', { kind: 'milestone', date: '2028-02-29', title: '  Первый этап  ' });
  assert.equal(stage.status, 201);
  assert.equal(stage.body.title, 'Первый этап');
  assert.equal(stage.body.completed, false);
  const note = await api.request(`/api/projects/${project.id}/planning`, 'POST', { kind: 'note', date: '2028-02-29', title: 'Первая строка\nВторая строка' });
  assert.equal(note.status, 201);
  const edit = await api.request(`/api/planning/${stage.body.id}`, 'PATCH', { completed: true, title: 'Готовый этап', date: '2028-03-01' });
  assert.equal(edit.status, 200);
  assert.equal(edit.body.completed, true);
  await api.restart();
  const entries = await api.entries();
  assert.deepEqual(entries.find(e => e.id === edit.body.id), edit.body);
  assert.equal(entries.find(e => e.id === note.body.id).title, 'Первая строка\nВторая строка');
  assert.equal(entries.find(e => e.id === note.body.id).date, '2028-02-29');
  assert.equal((await api.request(`/api/planning/${stage.body.id}`, 'DELETE')).status, 204);
  assert.equal((await api.request(`/api/planning/${stage.body.id}`, 'PATCH', { completed: false })).status, 404);
  assert.equal((await api.entries()).length, 1);
});

test('planning rejects invalid dates and values without changing saved entries', async t => {
  const api = await setup(t);
  const project = await api.project();
  const url = `/api/projects/${project.id}/planning`;
  const base = { kind: 'milestone', title: 'Этап', date: '2026-10-26' };
  for (const date of ['2026-02-29', '2100-02-29', '2026-04-31', '2026-00-10', '2026-13-01', '2026-01-00', '2026-1-01', '0000-01-01', '2026-10-26T00:00:00Z', null, 20261026]) {
    assert.equal((await api.request(url, 'POST', { ...base, date })).status, 400, String(date));
  }
  for (const invalid of [{ kind: 'task' }, { title: '' }, { title: '   ' }, { title: 'x'.repeat(121) }, { completed: 1 }, { completed: null }, { kind: 'note', completed: true }, { kind: 'note', title: 'x'.repeat(4001) }]) {
    assert.equal((await api.request(url, 'POST', { ...base, ...invalid })).status, 400);
  }
  const stage = (await api.request(url, 'POST', base)).body;
  for (const body of [{ date: '2026-02-30' }, { kind: 'note' }, { kind: 'milestone' }, { completed: 'true' }, { title: '' }]) {
    assert.equal((await api.request(`/api/planning/${stage.id}`, 'PATCH', body)).status, 400);
  }
  assert.deepEqual(await api.entries(), [stage]);
  assert.equal((await api.request(url, 'POST', { ...base, date: '2000-02-29' })).status, 201);
  assert.equal((await api.request('/api/projects/00000000-0000-0000-0000-000000000099/planning', 'POST', base)).status, 404);
});

test('start/deadline ordering, single anchors and a single note per date are enforced per project', async t => {
  const api = await setup(t);
  const project = await api.project();
  const url = `/api/projects/${project.id}/planning`;
  const start = (await api.request(url, 'POST', { kind: 'start', date: '2026-10-26', title: 'Старт' })).body;
  assert.equal((await api.request(url, 'POST', { kind: 'deadline', date: '2026-10-25', title: 'Дедлайн' })).status, 400);
  const deadline = (await api.request(url, 'POST', { kind: 'deadline', date: '2026-11-10', title: 'Дедлайн' })).body;
  assert.equal((await api.request(`/api/planning/${start.id}`, 'PATCH', { date: '2026-11-11' })).status, 400);
  assert.equal((await api.request(`/api/planning/${deadline.id}`, 'PATCH', { date: '2026-10-25' })).status, 400);
  assert.equal((await api.request(`/api/planning/${deadline.id}`, 'PATCH', { date: start.date })).status, 200);
  for (const kind of ['start', 'deadline']) {
    assert.equal((await api.request(url, 'POST', { kind, date: start.date, title: 'Повтор' })).status, 400);
  }
  const note = (await api.request(url, 'POST', { kind: 'note', date: start.date, title: 'Заметка' })).body;
  assert.equal((await api.request(url, 'POST', { kind: 'note', date: start.date, title: 'Повтор' })).status, 400);
  const nextNote = (await api.request(url, 'POST', { kind: 'note', date: '2026-10-27', title: 'Другой день' })).body;
  assert.equal((await api.request(`/api/planning/${nextNote.id}`, 'PATCH', { date: note.date })).status, 400);
  assert.equal((await api.request(`/api/planning/${note.id}`, 'PATCH', { completed: true })).status, 400);
  assert.equal((await api.request(url, 'POST', { kind: 'milestone', date: start.date, title: 'Этап 1' })).status, 201);
  assert.equal((await api.request(url, 'POST', { kind: 'milestone', date: start.date, title: 'Этап 2' })).status, 201);
  const other = await api.project('Другой проект');
  assert.equal((await api.request(`/api/projects/${other.id}/planning`, 'POST', { kind: 'note', date: note.date, title: 'Своя заметка' })).status, 201);
  assert.equal((await api.request(`/api/projects/${other.id}/planning`, 'POST', { kind: 'start', date: '2026-12-01', title: 'Свой старт' })).status, 201);
});

test('removing a project cascades through descendant plans while other projects stay intact', async t => {
  const api = await setup(t);
  const root = await api.project('Родитель');
  const child = await api.project('Дочерний', root.id);
  const other = await api.project('Независимый');
  for (const project of [root, child, other]) {
    assert.equal((await api.request(`/api/projects/${project.id}/planning`, 'POST', { kind: 'note', date: '2026-10-26', title: project.name })).status, 201);
  }
  await api.request(`/api/projects/${root.id}`, 'DELETE');
  await api.restart();
  const entries = await api.entries();
  assert.equal(entries.length, 1);
  assert.equal(entries[0].projectId, other.id);
  assert.equal(entries[0].title, other.name);
});

test('adding planning to a legacy database preserves existing project content', async t => {
  const legacy = ['00000000-0000-0000-0000-000000000001', null, 'Существующий проект', 'Исходное описание', 'Дизайн', 'layers', null, '2026-01-01', '2026-01-02'];
  const api = await setup(t, dataDir => {
    const db = new DatabaseSync(path.join(dataDir, 'sidequest.sqlite'));
    db.exec('CREATE TABLE projects (id TEXT PRIMARY KEY, parentId TEXT REFERENCES projects(id) ON DELETE CASCADE, name TEXT NOT NULL, description TEXT NOT NULL, category TEXT NOT NULL, art TEXT NOT NULL, coverId TEXT, createdAt TEXT NOT NULL, updatedAt TEXT NOT NULL)');
    db.prepare('INSERT INTO projects VALUES (?,?,?,?,?,?,?,?,?)').run(...legacy);
    db.close();
  });
  const before = (await api.request('/api/projects')).body;
  assert.deepEqual(Object.values(before.projects[0]).slice(0, 9), legacy);
  assert.deepEqual(before.planningEntries, []);
  assert.equal((await api.request(`/api/projects/${legacy[0]}/planning`, 'POST', { kind: 'start', date: '2026-10-26', title: 'Старт' })).status, 201);
  await api.restart();
  const after = (await api.request('/api/projects')).body;
  assert.deepEqual(after.projects, before.projects);
  assert.equal(after.planningEntries.length, 1);
});
