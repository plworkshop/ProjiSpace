import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, readdir, readFile, writeFile, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createApp } from './app.mjs';
import { DatabaseSync } from 'node:sqlite';
import { supportedLanguages, translate } from '../src/translations.mjs';

const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aD1sAAAAASUVORK5CYII=', 'base64');

test('image annotations persist separately, validate atomically and cascade with their reference', async t => {
  const api=await setup(t);
  const project=(await api.request('/api/projects','POST',{name:'Markup'})).body;
  const ref=(await api.request(`/api/projects/${project.id}/images`,'POST',PNG,{'content-type':'image/png'})).body;
  const url=`/api/references/${ref.id}/annotations`;
  assert.deepEqual((await api.request(url)).body,[]);
  const marks=['pen','marker','line','arrow','rectangle','ellipse'].map(tool=>({tool,color:'#ed5268',width:0.003,points:[[0.1,0.2],[0.8,0.9]]}));
  assert.equal((await api.request(url,'PUT',{annotations:marks})).status,204);
  await api.restart();
  assert.deepEqual((await api.request(url)).body,marks);
  const file=(await readdir(path.join(api.dataDir,'files')))[0];
  assert.deepEqual(await readFile(path.join(api.dataDir,'files',file)),PNG);
  const bad=[null,{},Array(501).fill(marks[0]),[{...marks[0],tool:'script'}],[{...marks[0],color:'url(javascript:1)'}],[{...marks[0],color:{toString:{}}}],[{...marks[0],points:[[0,2]]}],[{...marks[0],width:0}],[{...marks[2],points:[[0,0]]}],[{...marks[0],points:Array(5001).fill([0,0])}],Array(5).fill({...marks[0],points:Array(5000).fill([0,0])})];
  for(const annotations of bad) {
    assert.equal((await api.request(url,'PUT',{annotations})).status,400);
    assert.deepEqual((await api.request(url)).body,marks);
  }
  const link=(await api.request(`/api/projects/${project.id}/links`,'POST',{title:'Link',url:'https://example.com'})).body;
  assert.equal((await api.request(`/api/references/${link.id}/annotations`)).status,404);
  assert.equal((await api.request(url,'PUT',{annotations:[]})).status,204);
  assert.deepEqual((await api.request(url)).body,[]);
  await api.request(url,'PUT',{annotations:marks});
  await api.request(`/api/references/${ref.id}`,'DELETE');
  assert.equal((await api.request(url)).status,404);
  const db=new DatabaseSync(path.join(api.dataDir,'sidequest.sqlite'),{readOnly:true});
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM reference_annotations').get().n,0);
  db.close();
});

test('project priority persists, appends new projects and reorders only complete sibling groups', async t => {
  const api = await setup(t);
  const make = async (name,parentId=null) => (await api.request('/api/projects','POST',{name,parentId})).body;
  const a=await make('A'), b=await make('B'), c=await make('C');
  const a1=await make('A1',a.id), a2=await make('A2',a.id);
  const order=async parent => (await api.request('/api/projects')).body.projects.filter(p=>p.parentId===parent).map(p=>p.id);
  const original=(await api.request('/api/projects')).body.projects;
  assert.equal((await api.request('/api/projects/order','PATCH',{ids:[c.id,a.id,b.id]})).status,204);
  assert.equal((await api.request('/api/projects/order','PATCH',{ids:[a2.id,a1.id]})).status,204);
  await api.restart();
  assert.deepEqual(await order(null),[c.id,a.id,b.id]);
  assert.deepEqual(await order(a.id),[a2.id,a1.id]);
  for(const ids of [[],[a.id,a.id,c.id],[a.id,b.id],[a1.id,b.id,c.id],[null]]) {
    assert.equal((await api.request('/api/projects/order','PATCH',{ids})).status,409);
    assert.deepEqual(await order(null),[c.id,a.id,b.id]);
  }
  const loaded=(await api.request('/api/projects')).body.projects;
  for(const p of original) assert.deepEqual(loaded.find(item=>item.id===p.id),p);
  const d=await make('D');
  assert.deepEqual(await order(null),[c.id,a.id,b.id,d.id]);
  await api.request(`/api/projects/${a1.id}`,'PATCH',{parentId:b.id});
  assert.deepEqual(await order(b.id),[a1.id]);
});

test('all technical covers can be created, changed and loaded after restart', async t => {
  const api = await setup(t);
  const arts = ['chip','circuit','server','network'];
  const projects = [];
  for (const art of arts) {
    const created = await api.request('/api/projects','POST',{name:art,art});
    assert.equal(created.status,201);
    projects.push(created.body);
  }
  await api.restart();
  assert.deepEqual((await api.request('/api/projects')).body.projects,projects);
  for (const [index,project] of projects.entries()) {
    const art=arts[(index+1)%arts.length];
    const updated=await api.request(`/api/projects/${project.id}`,'PATCH',{art});
    assert.equal(updated.status,200);
    projects[index]=updated.body;
  }
  await api.restart();
  assert.deepEqual((await api.request('/api/projects')).body.projects,projects);
  assert.equal((await api.request('/api/projects','POST',{name:'Invalid',art:'unrecognized'})).status,400);
});

test('expanding legacy cover choices preserves rows, files, plans and cascade deletion', async t => {
  const root='00000000-0000-4000-8000-000000000001';
  const child='00000000-0000-4000-8000-000000000002';
  const image='00000000-0000-4000-8000-000000000003';
  const note='00000000-0000-4000-8000-000000000004';
  const stored=image+'.png';
  const tables=['projects','project_references','project_planning','metadata'];
  const snapshot=db=>tables.map(table=>db.prepare(`SELECT rowid,* FROM ${table} ORDER BY rowid`).all());
  let before;
  const api = await setup(t,{},async dataDir=>{
    const db=new DatabaseSync(path.join(dataDir,'sidequest.sqlite'));
    db.exec(`PRAGMA foreign_keys=ON;
      CREATE TABLE metadata (key TEXT PRIMARY KEY, value TEXT NOT NULL);
      INSERT INTO metadata VALUES ('initialized','1'),('language','en'),('pickerTheme','tech');
      CREATE TABLE projects (
        id TEXT PRIMARY KEY, parentId TEXT REFERENCES projects(id) ON DELETE CASCADE,
        name TEXT NOT NULL, description TEXT NOT NULL, category TEXT NOT NULL,
        art TEXT NOT NULL CHECK(art IN ('orbit','layers','bloom','arch')), coverId TEXT,
        createdAt TEXT NOT NULL, updatedAt TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'in_progress' CHECK(status IN ('planned','in_progress','paused','completed')),
        pinned INTEGER NOT NULL DEFAULT 0 CHECK(pinned IN (0,1)), descriptionHtml TEXT);
      CREATE TABLE project_references (
        id TEXT PRIMARY KEY, projectId TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
        kind TEXT NOT NULL CHECK(kind IN ('image','link')), title TEXT NOT NULL, url TEXT NOT NULL,
        fileName TEXT, mime TEXT, size INTEGER, storedName TEXT);
      CREATE TABLE project_planning (
        id TEXT PRIMARY KEY, projectId TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
        kind TEXT NOT NULL CHECK(kind IN ('start','milestone','deadline','note')),
        date TEXT NOT NULL, title TEXT NOT NULL, completed INTEGER NOT NULL DEFAULT 0 CHECK(completed IN (0,1)));`);
    const insert=db.prepare('INSERT INTO projects VALUES (?,?,?,?,?,?,?,?,?,?,?,?)');
    insert.run(root,null,'Original / Оригинал','Rich text','Design','layers',image,'2026-01-01','2026-01-02','paused',1,'<p><strong>Rich</strong> text</p>');
    insert.run(child,root,'Child','Keep this description','Development','orbit',null,'2026-01-03','2026-01-04','completed',0,null);
    db.prepare('INSERT INTO project_references VALUES (?,?,?,?,?,?,?,?,?)').run(image,root,'image','Cover','/api/files/'+image,'original.png','image/png',PNG.length,stored);
    db.prepare('INSERT INTO project_planning VALUES (?,?,?,?,?,?)').run(note,child,'note','2026-10-28','Keep this note',0);
    before=snapshot(db);
    db.close();
    await mkdir(path.join(dataDir,'files'));
    await writeFile(path.join(dataDir,'files',stored),PNG);
  });
  const db=new DatabaseSync(path.join(api.dataDir,'sidequest.sqlite'),{readOnly:true});
  assert.deepEqual(snapshot(db),before);
  assert.deepEqual(db.prepare('PRAGMA foreign_key_check').all(),[]);
  db.close();
  assert.equal((await api.request('/api/files/'+image)).status,200);
  assert.equal((await api.request(`/api/projects/${root}`,'PATCH',{art:'chip'})).status,200);
  await api.restart();
  const saved=(await api.request('/api/projects')).body;
  assert.equal(saved.projects.find(project=>project.id===root).art,'chip');
  assert.equal(saved.projects.find(project=>project.id===root).coverId,image);
  assert.equal(saved.planningEntries[0].id,note);
  assert.equal((await api.request(`/api/projects/${root}`,'DELETE')).status,204);
  const empty=(await api.request('/api/projects')).body;
  assert.deepEqual(empty.projects,[]);
  assert.deepEqual(empty.references,[]);
  assert.deepEqual(empty.planningEntries,[]);
  assert.equal((await api.request('/api/files/'+image)).status,404);
  assert.deepEqual(await readdir(path.join(api.dataDir,'files')),[]);
});
test('picker theme defaults to game, persists and validates atomically without changing projects', async t => {
  const api = await setup(t);
  const before = (await api.request('/api/projects')).body;
  assert.equal(before.pickerTheme,'game');
  for (const pickerTheme of ['tech','game','tech']) {
    assert.equal((await api.request('/api/preferences','PATCH',{pickerTheme})).status,204);
    await api.restart();
    assert.deepEqual((await api.request('/api/projects')).body,{...before,pickerTheme});
  }
  for (const pickerTheme of ['unknown',null,true,1,{},[]]) {
    assert.equal((await api.request('/api/preferences','PATCH',{pickerTheme,language:'en',projectsPanelWidth:400})).status,400);
    assert.deepEqual((await api.request('/api/projects')).body,{...before,pickerTheme:'tech'});
  }
});
test('accent color persists independently and rejects invalid combined updates atomically', async t => {
  const api = await setup(t);
  const project = (await api.request('/api/projects','POST',{name:'Color test',description:'Keep this content',art:'chip'})).body;
  await api.request(`/api/projects/${project.id}/planning`,'POST',{kind:'note',date:'2026-10-28',title:'Keep this note'});
  const before = (await api.request('/api/projects')).body;
  assert.equal(before.accentColor,'blue');
  for (const accentColor of ['blue','blue']) {
    assert.equal((await api.request('/api/preferences','PATCH',{accentColor})).status,204);
    await api.restart();
    assert.deepEqual((await api.request('/api/projects')).body,{...before,accentColor});
  }
  for (const accentColor of ['orange','yellow','',null,true,1,{},[]]) {
    assert.equal((await api.request('/api/preferences','PATCH',{accentColor,language:'en',pickerTheme:'tech',projectsPanelWidth:400})).status,400);
    assert.deepEqual((await api.request('/api/projects')).body,{...before,accentColor:'blue'});
  }
});
test('light appearance persists independently and invalid combinations cannot partially change preferences', async t => {
  const api = await setup(t);
  const project = (await api.request('/api/projects','POST',{name:'Appearance test',description:'Keep the project'})).body;
  await api.request(`/api/projects/${project.id}/planning`,'POST',{kind:'note',date:'2026-10-29',title:'Keep the note'});
  const before = (await api.request('/api/projects')).body;
  assert.equal(before.appearance,'dark');
  for (const appearance of ['light','dark','light']) {
    assert.equal((await api.request('/api/preferences','PATCH',{appearance})).status,204);
    await api.restart();
    assert.deepEqual((await api.request('/api/projects')).body,{...before,appearance});
  }
  for (const appearance of ['system','',null,true,1,{},[]]) {
    assert.equal((await api.request('/api/preferences','PATCH',{appearance,accentColor:'blue',pickerTheme:'tech',language:'en'})).status,400);
    assert.deepEqual((await api.request('/api/projects')).body,{...before,appearance:'light'});
  }
});
test('legacy accents open as blue without rewriting stored data', async t => {
  const api = await setup(t);
  await api.request('/api/projects','POST',{name:'Legacy color',description:'Keep this content'});
  const before = (await api.request('/api/projects')).body;
  for (const legacy of ['yellow','orange']) {
    const stored = new DatabaseSync(path.join(api.dataDir,'sidequest.sqlite'));
    stored.prepare("INSERT OR REPLACE INTO metadata (key,value) VALUES ('accentColor',?)").run(legacy);
    stored.close();
    await api.restart();
    assert.deepEqual((await api.request('/api/projects')).body,{...before,accentColor:'blue'});
    const verified = new DatabaseSync(path.join(api.dataDir,'sidequest.sqlite'),{readOnly:true});
    assert.equal(verified.prepare("SELECT value FROM metadata WHERE key='accentColor'").get().value,legacy);
    verified.close();
  }
});
async function setup(t, options = {}, prepare) {
  const dataDir = await mkdtemp(path.join(tmpdir(), 'sidequest-test-'));
  await prepare?.(dataDir);
  let app;
  async function start() {
    app = await createApp({ dataDir, seed: false, ...options });
    await new Promise(resolve => app.server.listen(0, '127.0.0.1', resolve));
    return `http://127.0.0.1:${app.server.address().port}`;
  }
  let base = await start();
  t.after(async () => { await app.close(); await rm(dataDir, { recursive: true, force: true }); });
  return {
    dataDir,
    async restart() { await app.close(); base = await start(); },
    async request(url, method = 'GET', body, headers = {}) {
      const response = await fetch(base + url, { method, body: body === undefined ? undefined : Buffer.isBuffer(body) ? body : JSON.stringify(body), headers: { ...(body === undefined || Buffer.isBuffer(body) ? {} : { 'content-type': 'application/json' }), ...headers } });
      const text = await response.text();
      return { status: response.status, body: response.headers.get('content-type')?.startsWith('application/json') && text ? JSON.parse(text) : text, headers: response.headers };
    },
  };
}

test('subprojects stay directly under root projects on create and reparent', async t => {
  const api = await setup(t);
  const root = (await api.request('/api/projects', 'POST', { name: 'Main' })).body;
  const other = (await api.request('/api/projects', 'POST', { name: 'Other' })).body;
  const child = (await api.request('/api/projects', 'POST', { name: 'Child', parentId: root.id })).body;
  const sibling = (await api.request('/api/projects', 'POST', { name: 'Sibling', parentId: root.id })).body;
  const before = (await api.request('/api/projects')).body;
  assert.equal((await api.request('/api/projects', 'POST', { name: 'Too deep', parentId: child.id })).status, 400);
  assert.equal((await api.request(`/api/projects/${sibling.id}`, 'PATCH', { name: 'Do not change', parentId: child.id })).status, 400);
  assert.equal((await api.request(`/api/projects/${root.id}`, 'PATCH', { parentId: other.id })).status, 400);
  assert.deepEqual((await api.request('/api/projects')).body, before);
  assert.equal((await api.request(`/api/projects/${child.id}`, 'PATCH', { parentId: other.id })).status, 200);
  await api.restart();
  const projects = (await api.request('/api/projects')).body.projects;
  assert.equal(projects.find(p => p.id === child.id).parentId, other.id);
  assert.ok(projects.every(p => p.parentId === null || projects.find(parent => parent.id === p.parentId).parentId === null));
});

test('projects and descriptions persist; cycles rejected; descendant deletion cascades', async t => {
  const api = await setup(t);
  const root = await api.request('/api/projects', 'POST', { name: 'Первый проект', art: 'arch' });
  assert.equal(root.status, 201);
  const child = await api.request('/api/projects', 'POST', { name: 'Подпроект', parentId: root.body.id });
  const sibling = await api.request('/api/projects', 'POST', { name: 'Деталь', parentId: root.body.id });
  assert.equal(sibling.status, 201);
  const edit = await api.request(`/api/projects/${root.body.id}`, 'PATCH', { description: 'Первая строка\nВторая строка', category: 'Разработка' });
  assert.equal(edit.body.description, 'Первая строка\nВторая строка');
  assert.equal((await api.request(`/api/projects/${root.body.id}`, 'PATCH', { parentId: child.body.id })).status, 400);
  assert.equal((await api.request('/api/projects', 'POST', { name: 'Нет родителя', parentId: 'missing' })).status, 404);
  await api.restart();
  const list = (await api.request('/api/projects')).body;
  assert.equal(list.projects.length, 3);
  assert.equal(list.projects.find(p => p.id === root.body.id).description, 'Первая строка\nВторая строка');
  assert.equal(list.storagePath, api.dataDir);
  assert.equal((await api.request(`/api/projects/${root.body.id}`, 'DELETE')).status, 204);
  assert.equal((await api.request('/api/projects')).body.projects.length, 0);
});

test('project statuses validate, stay independent and persist across restart and edits', async t => {
  const api = await setup(t);
  const project = (await api.request('/api/projects', 'POST', { name: 'Статусы' })).body;
  assert.equal(project.status, 'planned');
  const child = (await api.request('/api/projects', 'POST', { name: 'Подпроект', parentId: project.id })).body;
  for (const status of ['in_progress', 'paused', 'completed', 'planned']) {
    const update = await api.request(`/api/projects/${project.id}`, 'PATCH', { status });
    assert.equal(update.status, 200);
    assert.equal(update.body.status, status);
  }
  await api.request(`/api/projects/${project.id}`, 'PATCH', { status: 'completed' });
  for (const status of ['unknown', '', null, 1]) {
    assert.equal((await api.request(`/api/projects/${project.id}`, 'PATCH', { status })).status, 400);
    assert.equal((await api.request('/api/projects', 'POST', { name: 'Некорректный', status })).status, 400);
  }
  await api.request(`/api/projects/${project.id}`, 'PATCH', { description: 'Описание сохраняется отдельно' });
  await api.restart();
  const projects = (await api.request('/api/projects')).body.projects;
  assert.equal(projects.find(p => p.id === project.id).status, 'completed');
  assert.equal(projects.find(p => p.id === project.id).description, 'Описание сохраняется отдельно');
  assert.equal(projects.find(p => p.id === child.id).status, 'planned');
});

test('legacy project database gains a status without changing existing project data', async t => {
  const legacy = ['00000000-0000-0000-0000-000000000001', null, 'Существующий проект', 'Старое описание', 'Дизайн', 'layers', null, '2026-01-01', '2026-01-02'];
  const api = await setup(t, {}, dataDir => {
    const db = new DatabaseSync(path.join(dataDir, 'sidequest.sqlite'));
    db.exec('CREATE TABLE projects (id TEXT PRIMARY KEY, parentId TEXT REFERENCES projects(id) ON DELETE CASCADE, name TEXT NOT NULL, description TEXT NOT NULL, category TEXT NOT NULL, art TEXT NOT NULL, coverId TEXT, createdAt TEXT NOT NULL, updatedAt TEXT NOT NULL)');
    db.prepare('INSERT INTO projects VALUES (?,?,?,?,?,?,?,?,?)').run(...legacy);
    db.close();
  });
  const project = (await api.request('/api/projects')).body.projects[0];
  assert.equal(project.status, 'in_progress');
  assert.equal(project.pinned, false);
  assert.equal(project.descriptionHtml, null);
  assert.deepEqual(Object.values(project).slice(0, 9), legacy);
  await api.request(`/api/projects/${project.id}`, 'PATCH', { status: 'paused', pinned: true });
  await api.restart();
  assert.equal((await api.request('/api/projects')).body.projects[0].status, 'paused');
  assert.equal((await api.request('/api/projects')).body.projects[0].pinned, true);
});

test('pins persist independently, validate booleans and survive other project edits', async t => {
  const api = await setup(t);
  const root = (await api.request('/api/projects', 'POST', { name: 'Родитель' })).body;
  assert.equal(root.pinned, false);
  const child = (await api.request('/api/projects', 'POST', { name: 'Подпроект', parentId: root.id, pinned: true })).body;
  assert.equal(child.pinned, true);
  const pin = await api.request(`/api/projects/${root.id}`, 'PATCH', { pinned: true });
  assert.equal(pin.status, 200);
  assert.equal(pin.body.pinned, true);
  for (const pinned of [1, 0, 'true', null, {}]) {
    assert.equal((await api.request(`/api/projects/${root.id}`, 'PATCH', { pinned })).status, 400);
    assert.equal((await api.request('/api/projects', 'POST', { name: 'Некорректный', pinned })).status, 400);
  }
  await api.request(`/api/projects/${root.id}`, 'PATCH', { status: 'completed', description: 'Описание' });
  await api.restart();
  let projects = (await api.request('/api/projects')).body.projects;
  assert.ok(projects.every(p => p.pinned === true));
  assert.equal(projects.find(p => p.id === root.id).description, 'Описание');
  assert.equal(projects.find(p => p.id === root.id).status, 'completed');
  await api.request(`/api/projects/${root.id}`, 'PATCH', { pinned: false });
  await api.restart();
  projects = (await api.request('/api/projects')).body.projects;
  assert.equal(projects.find(p => p.id === root.id).pinned, false);
  assert.equal(projects.find(p => p.id === child.id).pinned, true);
  await api.request(`/api/projects/${root.id}`, 'DELETE');
  assert.deepEqual((await api.request('/api/projects')).body.projects, []);
});

test('formatted descriptions persist with plain previews and clear on plain-text edits', async t => {
  const api = await setup(t);
  const rich = { name: 'Форматирование', description: 'План\n\nВажная задача', descriptionHtml: '<h2>План</h2><p><strong>Важная</strong> <u>задача</u></p>' };
  const created = await api.request('/api/projects', 'POST', rich);
  assert.equal(created.status, 201);
  assert.equal(created.body.descriptionHtml, rich.descriptionHtml);
  const id = created.body.id;
  await api.request(`/api/projects/${id}`, 'PATCH', { status: 'paused', pinned: true, name: 'Новый заголовок' });
  await api.restart();
  let project = (await api.request('/api/projects')).body.projects[0];
  assert.equal(project.description, rich.description);
  assert.equal(project.descriptionHtml, rich.descriptionHtml);
  for (const descriptionHtml of [42, {}, 'x'.repeat(200001)]) {
    assert.equal((await api.request(`/api/projects/${id}`, 'PATCH', { description: 'Текст', descriptionHtml })).status, 400);
  }
  assert.equal((await api.request(`/api/projects/${id}`, 'PATCH', { descriptionHtml: '<p>Без текста</p>' })).status, 400);
  const edit = await api.request(`/api/projects/${id}`, 'PATCH', { description: 'Список\n\nПункт', descriptionHtml: '<h2>Список</h2><ul><li><p>Пункт</p></li></ul>' });
  assert.equal(edit.status, 200);
  await api.restart();
  project = (await api.request('/api/projects')).body.projects[0];
  assert.match(project.descriptionHtml, /<ul>/);
  await api.request(`/api/projects/${id}`, 'PATCH', { description: 'Обычный текст' });
  await api.restart();
  project = (await api.request('/api/projects')).body.projects[0];
  assert.equal(project.description, 'Обычный текст');
  assert.equal(project.descriptionHtml, null);
});

test('image upload, cover, persistence, reference deletion and file cleanup', async t => {
  const api = await setup(t);
  const project = (await api.request('/api/projects', 'POST', { name: 'Изображения' })).body;
  const upload = await api.request(`/api/projects/${project.id}/images`, 'POST', PNG, { 'content-type': 'image/png', 'x-file-name': encodeURIComponent('Референс.png') });
  assert.equal(upload.status, 201);
  assert.equal(upload.body.fileName, 'Референс.png');
  assert.equal(upload.body.size, PNG.length);
  assert.equal((await api.request(`/api/projects/${project.id}`, 'PATCH', { coverId: upload.body.id })).status, 200);
  await api.request(`/api/projects/${project.id}`, 'PATCH', { status: 'completed' });
  await api.restart();
  const image = await api.request(upload.body.url);
  assert.equal(image.status, 200);
  assert.equal(image.headers.get('content-type'), 'image/png');
  assert.equal(Number(image.headers.get('content-length')), PNG.length);
  assert.equal((await readdir(path.join(api.dataDir, 'files'))).length, 1);
  assert.equal((await api.request(`/api/references/${upload.body.id}`, 'DELETE')).status, 204);
  const list = (await api.request('/api/projects')).body;
  assert.equal(list.projects[0].coverId, null);
  assert.deepEqual(list.references, []);
  assert.deepEqual(await readdir(path.join(api.dataDir, 'files')), []);
  assert.equal((await api.request(upload.body.url)).status, 404);
});

test('deleting a parent cleans descendant files and links', async t => {
  const api = await setup(t);
  const root = (await api.request('/api/projects', 'POST', { name: 'Родитель' })).body;
  const child = (await api.request('/api/projects', 'POST', { name: 'Ребёнок', parentId: root.id })).body;
  await api.request(`/api/projects/${child.id}/images`, 'POST', PNG, { 'content-type': 'image/png' });
  assert.equal((await api.request(`/api/projects/${child.id}/links`, 'POST', { title: 'Ссылка', url: 'https://example.com/reference' })).status, 201);
  await api.request(`/api/projects/${root.id}`, 'DELETE');
  assert.deepEqual((await api.request('/api/projects')).body.references, []);
  assert.deepEqual(await readdir(path.join(api.dataDir, 'files')), []);
});

test('validation, origins, unsupported content, upload size and traversal', async t => {
  const api = await setup(t);
  assert.equal((await api.request('/api/projects', 'POST', { name: '   ' })).status, 400);
  assert.equal((await api.request('/api/projects', 'POST', { name: 'a'.repeat(121) })).status, 400);
  assert.equal((await api.request('/api/projects', 'POST', { name: 'Проект', art: 'unknown' })).status, 400);
  assert.equal((await api.request('/api/projects', 'POST', { name: 'Чужой' }, { origin: 'https://evil.example' })).status, 403);
  assert.equal((await api.request('/api/projects', 'POST', { name: 'Чужой' }, { 'sec-fetch-site': 'cross-site' })).status, 403);
  const project = (await api.request('/api/projects', 'POST', { name: 'Проверки' }, { origin: 'http://127.0.0.1:5173' })).body;
  for (const url of ['javascript:alert(1)', 'file:///C:/Windows/win.ini', 'data:text/html,test', 'no-url', 'https://user:secret@example.com']) {
    assert.equal((await api.request(`/api/projects/${project.id}/links`, 'POST', { url })).status, 400);
  }
  assert.equal((await api.request(`/api/projects/${project.id}/images`, 'POST', Buffer.from('<svg/>'), { 'content-type': 'image/svg+xml' })).status, 415);
  assert.equal((await api.request(`/api/projects/${project.id}/images`, 'POST', Buffer.from('not PNG'), { 'content-type': 'image/png' })).status, 400);
  assert.equal((await api.request(`/api/projects/${project.id}/images`, 'POST', Buffer.alloc(20 * 1024 * 1024 + 1), { 'content-type': 'image/png' })).status, 413);
  const upload = (await api.request(`/api/projects/${project.id}/images`, 'POST', PNG, { 'content-type': 'image/png', 'x-file-name': encodeURIComponent('../../secret.png') })).body;
  assert.equal(upload.fileName, 'secret.png');
  assert.ok((await readdir(path.join(api.dataDir, 'files'))).every(name => /^[a-f0-9-]+\.png$/.test(name)));
  assert.equal((await api.request('/api/files/..%2f..%2fsidequest.sqlite')).status, 404);
  assert.equal((await api.request('/%2e%2e%5cdata%5csidequest.sqlite')).status, 404);
  assert.equal((await api.request(`/api/projects/${project.id}`, 'PATCH', { coverId: 'missing' })).status, 400);
});

test('demos are seeded once and never reappear after deleting all projects', async t => {
  const api = await setup(t, { seed: true });
  const projects = (await api.request('/api/projects')).body.projects;
  assert.equal(projects.length, 4);
  assert.ok(projects.every(p => p.category.startsWith('Демо ·')));
  for (const project of projects) await api.request(`/api/projects/${project.id}`, 'DELETE');
  await api.restart();
  assert.deepEqual((await api.request('/api/projects')).body.projects, []);
});

test('production serves dist and returns build guidance when absent', async t => {
  const distDir = await mkdtemp(path.join(tmpdir(), 'sidequest-dist-'));
  t.after(() => rm(distDir, { recursive: true, force: true }));
  const api = await setup(t, { distDir });
  assert.equal((await api.request('/')).status, 404);
  await writeFile(path.join(distDir, 'index.html'), '<!doctype html><title>Sidequest</title>');
  await mkdir(path.join(distDir, 'assets'));
  await writeFile(path.join(distDir, 'assets', 'app.js'), 'console.log("ok")');
  assert.match((await api.request('/')).body, /Sidequest/);
  assert.equal((await api.request('/assets/app.js')).headers.get('content-type'), 'text/javascript; charset=utf-8');
  assert.equal((await api.request('/')).headers.get('cache-control'), 'no-cache');
});

test('desktop API requires its private session, including reads and image requests', async t => {
  const api = await setup(t, { accessToken: 'desktop-session-test-token' });
  assert.equal((await api.request('/api/projects')).status, 403);
  assert.equal((await api.request('/api/files/00000000-0000-0000-0000-000000000001')).status, 403);
  assert.equal((await api.request('/api/projects', 'GET', undefined, { cookie: 'sidequest_session=wrong' })).status, 403);
  const headers = { cookie: 'sidequest_session=desktop-session-test-token' };
  assert.equal((await api.request('/api/projects', 'POST', { name: 'Desktop' }, headers)).status, 201);
  assert.equal((await api.request('/api/projects', 'GET', undefined, headers)).body.projects.length, 1);
  assert.equal((await api.request('/api/projects', 'POST', { name: 'Чужой' }, { ...headers, origin: 'https://example.com' })).status, 403);
});


test('reference panel width validates and persists after restart', async t => {
  const api = await setup(t);
  assert.equal((await api.request('/api/projects')).body.referencePanelWidth, 265);
  for (const width of [199, 561, 300.5, '320', null]) {
    assert.equal((await api.request('/api/preferences', 'PATCH', { referencePanelWidth: width })).status, 400);
  }
  assert.equal((await api.request('/api/preferences', 'PATCH', { referencePanelWidth: 420 })).status, 204);
  await api.restart();
  assert.equal((await api.request('/api/projects')).body.referencePanelWidth, 420);
});

test('projects panel width persists independently and validates combined preference updates atomically', async t => {
  const api = await setup(t);
  assert.equal((await api.request('/api/projects')).body.projectsPanelWidth, null);
  for (const width of [189,421,250.5,'300',null]) assert.equal((await api.request('/api/preferences','PATCH',{projectsPanelWidth:width})).status,400);
  assert.equal((await api.request('/api/preferences','PATCH',{projectsPanelWidth:360,referencePanelWidth:320,language:'en'})).status,204);
  await api.restart();
  const saved = (await api.request('/api/projects')).body;
  assert.equal(saved.projectsPanelWidth,360);
  assert.equal(saved.referencePanelWidth,320);
  assert.equal(saved.language,'en');
  assert.equal((await api.request('/api/preferences','PATCH',{projectsPanelWidth:500,referencePanelWidth:400})).status,400);
  const unchanged = (await api.request('/api/projects')).body;
  assert.equal(unchanged.projectsPanelWidth,360);
  assert.equal(unchanged.referencePanelWidth,320);
  assert.equal((await api.request('/api/preferences','PATCH',{referencePanelWidth:280})).status,204);
  assert.equal((await api.request('/api/projects')).body.projectsPanelWidth,360);
});

test('language persists independently, localizes API errors and preserves project content', async t => {
  const api = await setup(t);
  assert.equal((await api.request('/api/projects')).body.language, 'ru');
  const project = await api.request('/api/projects','POST',{name:'Мой проект',description:'Мой текст',descriptionHtml:'<p>Мой текст</p>'});
  assert.equal((await api.request('/api/preferences','PATCH',{language:'en'})).status,204);
  await api.restart();
  const data = (await api.request('/api/projects')).body;
  assert.equal(data.language,'en');
  assert.deepEqual(data.projects[0],project.body);
  assert.equal((await api.request('/api/projects','POST',{name:''})).body.error,'Please check the “Name” field.');
  for(const language of ['zz','',null,1]) assert.equal((await api.request('/api/preferences','PATCH',{language})).status,400);
  assert.equal((await api.request('/api/preferences','PATCH',{referencePanelWidth:400})).status,204);
  assert.equal((await api.request('/api/projects')).body.language,'en');
  assert.equal((await api.request('/api/projects','POST',{name:''},{'accept-language':'ru'})).body.error,'Проверьте поле «Название».');
  assert.equal((await api.request('/api/preferences','PATCH',{language:'ru'})).status,204);
  assert.equal((await api.request('/api/projects')).body.referencePanelWidth,400);
});

test('collapsed interface sections persist independently without changing widths or project content', async t => {
  const api = await setup(t);
  const initial = (await api.request('/api/projects')).body;
  assert.equal(initial.projectsPanelCollapsed, false);
  assert.equal(initial.planCollapsed, false);
  const project = (await api.request('/api/projects','POST',{name:'Мой проект',description:'Существующее описание'})).body;
  assert.equal((await api.request('/api/preferences','PATCH',{projectsPanelWidth:360,referencePanelWidth:320,projectsPanelCollapsed:true,planCollapsed:true,language:'en'})).status,204);
  await api.restart();
  let saved = (await api.request('/api/projects')).body;
  assert.equal(saved.projectsPanelCollapsed,true);
  assert.equal(saved.planCollapsed,true);
  assert.equal(saved.projectsPanelWidth,360);
  assert.equal(saved.referencePanelWidth,320);
  assert.equal(saved.language,'en');
  assert.deepEqual(saved.projects,[project]);
  assert.equal((await api.request('/api/preferences','PATCH',{planCollapsed:false})).status,204);
  await api.restart();
  saved = (await api.request('/api/projects')).body;
  assert.equal(saved.projectsPanelCollapsed,true);
  assert.equal(saved.planCollapsed,false);
  assert.equal(saved.projectsPanelWidth,360);
  assert.equal((await api.request('/api/preferences','PATCH',{projectsPanelCollapsed:false})).status,204);
  assert.equal((await api.request('/api/projects')).body.projectsPanelWidth,360);
});

test('invalid collapsed-state updates cannot partially change other interface preferences', async t => {
  const api = await setup(t);
  await api.request('/api/preferences','PATCH',{projectsPanelWidth:340,referencePanelWidth:310,projectsPanelCollapsed:true,planCollapsed:false,language:'en'});
  const before = (await api.request('/api/projects')).body;
  for (const key of ['projectsPanelCollapsed','planCollapsed']) {
    for (const value of [null,0,1,'false','true',{},[]]) {
      assert.equal((await api.request('/api/preferences','PATCH',{[key]:value,projectsPanelWidth:400,referencePanelWidth:400,language:'ru'})).status,400);
      assert.deepEqual((await api.request('/api/projects')).body,before);
    }
  }
  for (const body of [{},{unrelated:true},{projectsPanelCollapsed:false,language:'unknown'},{planCollapsed:true,referencePanelWidth:199}]) {
    assert.equal((await api.request('/api/preferences','PATCH',body)).status,400);
    assert.deepEqual((await api.request('/api/projects')).body,before);
  }
});

test('every supported interface language persists and request language subtags localize errors', async t => {
  const api = await setup(t, {}, dataDir => {
    const db = new DatabaseSync(path.join(dataDir,'sidequest.sqlite'));
    db.exec("CREATE TABLE metadata (key TEXT PRIMARY KEY, value TEXT NOT NULL); INSERT INTO metadata VALUES ('language','unknown')");
    db.close();
  });
  assert.equal((await api.request('/api/projects')).body.language,'en');
  const project = (await api.request('/api/projects','POST',{name:'Не переводить',description:'Текст пользователя'})).body;
  for (const language of supportedLanguages) {
    assert.equal((await api.request('/api/preferences','PATCH',{language})).status,204);
    await api.restart();
    const saved = (await api.request('/api/projects')).body;
    assert.equal(saved.language,language);
    assert.deepEqual(saved.projects,[project]);
    assert.equal((await api.request('/api/projects/00000000-0000-0000-0000-000000000000','PATCH',{name:'test'})).body.error,translate('Проект не найден.',language));
  }
  await api.request('/api/preferences','PATCH',{language:'ru'});
  for (const [header, expected] of [['fr-FR,en;q=0.2','en'],['en-US','en'],['ru-RU','ru'],['ru-RU;q=0,en-US;q=0.4,de-DE;q=0.8','en'],['he-IL','ru'],['xx-XX','ru']]) {
    assert.equal((await api.request('/api/projects/00000000-0000-0000-0000-000000000000','PATCH',{name:'test'},{'accept-language':header})).body.error,translate('Проект не найден.',expected));
  }
});

test('retired languages fall back to English without changing projects or stored preferences', async t => {
  const retired = ['de','es','fr','pt','uk','he','zh','ja','ko'];
  for (const language of retired) {
    const api = await setup(t, {}, dataDir => {
      const db = new DatabaseSync(path.join(dataDir,'sidequest.sqlite'));
      db.exec('CREATE TABLE metadata (key TEXT PRIMARY KEY, value TEXT NOT NULL)');
      db.prepare('INSERT INTO metadata VALUES (?,?)').run('language',language);
      db.close();
    });
    const project = (await api.request('/api/projects','POST',{name:'Test / בדיקה / Проверка',description:'Keep all user content'})).body;
    await api.restart();
    const before = (await api.request('/api/projects')).body;
    assert.equal(before.language,'en');
    assert.deepEqual(before.projects,[project]);
    assert.equal((await api.request('/api/preferences','PATCH',{language,projectsPanelWidth:400})).status,400);
    assert.deepEqual((await api.request('/api/projects')).body,before);
    const db = new DatabaseSync(path.join(api.dataDir,'sidequest.sqlite'),{readOnly:true});
    assert.equal(db.prepare("SELECT value FROM metadata WHERE key='language'").get().value,language);
    db.close();
  }
});
