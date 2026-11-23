import { createServer } from 'node:http';
import { DatabaseSync } from 'node:sqlite';
import { randomUUID } from 'node:crypto';
import { mkdir, readFile, writeFile, unlink, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { supportedLanguages, translate } from '../src/translations.mjs';
import { createTranscriber } from './transcription.mjs';
import { createAssistant, assistantError } from './assistant.mjs';
import { createAssistantSetup } from './assistant-setup.mjs';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const IMAGE_TYPES = new Map([['image/png', 'png'], ['image/jpeg', 'jpg'], ['image/webp', 'webp'], ['image/gif', 'gif']]);
const ARTS = ['orbit', 'layers', 'bloom', 'arch', 'chip', 'circuit', 'server', 'network'];
const PROJECT_SCHEMA = `(
  id TEXT PRIMARY KEY, parentId TEXT REFERENCES projects(id) ON DELETE CASCADE,
  name TEXT NOT NULL, description TEXT NOT NULL, category TEXT NOT NULL,
  art TEXT NOT NULL CHECK(art IN (${ARTS.map(art => `'${art}'`).join(',')})), coverId TEXT,
  createdAt TEXT NOT NULL, updatedAt TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'in_progress' CHECK(status IN ('planned','in_progress','paused','completed')),
  pinned INTEGER NOT NULL DEFAULT 0 CHECK(pinned IN (0,1)), descriptionHtml TEXT
)`;
const STATUSES = ['planned', 'in_progress', 'paused', 'completed'];
const PLANNING_KINDS = ['start', 'milestone', 'deadline', 'note'];
const PREFERENCES = ['referencePanelWidth','projectsPanelWidth','language','projectsPanelCollapsed','planCollapsed','pickerTheme','accentColor','appearance'];
class RequestError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}
function reject(status, message) { throw new RequestError(status, message); }
function readBody(req, limit) {
  return new Promise((resolve, rejectBody) => {
    const chunks = []; let size = 0; let exceeded = false;
    req.on('data', chunk => {
      size += chunk.length;
      if (size > limit) {
        if (!exceeded) rejectBody(new RequestError(413, 'Файл или запрос слишком большой.'));
        exceeded = true; chunks.length = 0;
      } else if (!exceeded) chunks.push(chunk);
    });
    req.on('end', () => { if (!exceeded) resolve(Buffer.concat(chunks)); });
    req.on('error', rejectBody);
  });
}
async function jsonBody(req) {
  if (!req.headers['content-type']?.startsWith('application/json')) reject(415, 'Ожидается JSON.');
  let body;
  try { body = JSON.parse((await readBody(req, 1024 * 1024)).toString()); }
  catch (error) { if (error instanceof RequestError) throw error; reject(400, 'Некорректный JSON.'); }
  if (!body || typeof body !== 'object' || Array.isArray(body)) reject(400, 'Ожидается объект.');
  return body;
}
function textField(value, label, max, empty = false) {
  if (typeof value !== 'string' || value.length > max || (!empty && !value.trim())) reject(400, `Проверьте поле «${label}».`);
  return empty ? value : value.trim();
}
function validImage(buffer, mime) {
  if (mime === 'image/png') return buffer.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  if (mime === 'image/jpeg') return buffer[0] === 255 && buffer[1] === 216 && buffer[2] === 255;
  if (mime === 'image/webp') return buffer.toString('ascii', 0, 4) === 'RIFF' && buffer.toString('ascii', 8, 12) === 'WEBP';
  return ['GIF87a', 'GIF89a'].includes(buffer.toString('ascii', 0, 6));
}

export async function createApp({ dataDir = path.join(ROOT, 'data'), seed = true, distDir = path.join(ROOT, 'dist'), accessToken = null, storage = null, assistantFetch = fetch, assistantRuntime = null, requestDictationMicrophone = null, dictationExecutable = process.platform === 'win32' ? path.join(ROOT, 'desktop', 'voice', 'whisper-cli.exe') : null } = {}) {
  dataDir = path.resolve(dataDir);
  const filesDir = path.join(dataDir, 'files');
  const transcriber = createTranscriber({directory: path.join(dataDir, 'voice'), executable: dictationExecutable});
  await mkdir(filesDir, { recursive: true });
  const db = new DatabaseSync(path.join(dataDir, 'sidequest.sqlite'));
  db.exec(`PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON;
    CREATE TABLE IF NOT EXISTS metadata (key TEXT PRIMARY KEY, value TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS projects ${PROJECT_SCHEMA};
    CREATE TABLE IF NOT EXISTS project_references (
      id TEXT PRIMARY KEY, projectId TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      kind TEXT NOT NULL CHECK(kind IN ('image','link')), title TEXT NOT NULL, url TEXT NOT NULL,
      fileName TEXT, mime TEXT, size INTEGER, storedName TEXT
    );
    CREATE TABLE IF NOT EXISTS project_planning (
      id TEXT PRIMARY KEY, projectId TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      kind TEXT NOT NULL CHECK(kind IN ('start','milestone','deadline','note')),
      date TEXT NOT NULL, title TEXT NOT NULL, completed INTEGER NOT NULL DEFAULT 0 CHECK(completed IN (0,1))
    );
    CREATE UNIQUE INDEX IF NOT EXISTS planning_anchor ON project_planning(projectId,kind) WHERE kind IN ('start','deadline');
    CREATE UNIQUE INDEX IF NOT EXISTS planning_note_date ON project_planning(projectId,date) WHERE kind='note';`);
  if (!db.prepare('PRAGMA table_info(projects)').all().some(column => column.name === 'status')) {
    db.exec("ALTER TABLE projects ADD COLUMN status TEXT NOT NULL DEFAULT 'in_progress' CHECK(status IN ('planned','in_progress','paused','completed'))");
  }
  if (!db.prepare('PRAGMA table_info(projects)').all().some(column => column.name === 'pinned')) {
    db.exec('ALTER TABLE projects ADD COLUMN pinned INTEGER NOT NULL DEFAULT 0 CHECK(pinned IN (0,1))');
  }
  if (!db.prepare('PRAGMA table_info(projects)').all().some(column => column.name === 'descriptionHtml')) {
    db.exec('ALTER TABLE projects ADD COLUMN descriptionHtml TEXT');
  }
  if (!db.prepare("SELECT sql FROM sqlite_schema WHERE type='table' AND name='projects'").get().sql.includes("'chip'")) {
    // Expand the legacy CHECK constraint without cascading deletes into child tables.
    db.exec('PRAGMA foreign_keys=OFF');
    try {
      db.exec('BEGIN IMMEDIATE');
      try {
        const columns = 'rowid,id,parentId,name,description,category,art,coverId,createdAt,updatedAt,status,pinned,descriptionHtml';
        db.exec(`CREATE TABLE projects_cover_upgrade ${PROJECT_SCHEMA};
          INSERT INTO projects_cover_upgrade (${columns}) SELECT ${columns} FROM projects;
          DROP TABLE projects;
          ALTER TABLE projects_cover_upgrade RENAME TO projects;`);
        if (db.prepare('PRAGMA foreign_key_check').all().length) throw new Error('Cover migration failed its foreign key check.');
        db.exec('COMMIT');
      } catch (error) {
        db.exec('ROLLBACK');
        throw error;
      }
    } finally {
      db.exec('PRAGMA foreign_keys=ON');
    }
  }
  db.exec('CREATE TABLE IF NOT EXISTS project_priority (projectId TEXT PRIMARY KEY REFERENCES projects(id) ON DELETE CASCADE, position INTEGER NOT NULL)');
  db.exec('CREATE TABLE IF NOT EXISTS reference_annotations (referenceId TEXT PRIMARY KEY REFERENCES project_references(id) ON DELETE CASCADE, data TEXT NOT NULL)');
  db.exec('CREATE TABLE IF NOT EXISTS reference_clips (referenceId TEXT PRIMARY KEY REFERENCES project_references(id) ON DELETE CASCADE, text TEXT NOT NULL, capturedAt TEXT NOT NULL)');
  const orderedProjects = () => db.prepare('SELECT p.* FROM projects p LEFT JOIN project_priority o ON o.projectId=p.id ORDER BY o.position IS NULL, o.position, p.createdAt, p.rowid').all().map(projectRow);
  const projectRow = row => row ? { ...row, pinned: Boolean(row.pinned) } : undefined;
  const getProject = id => projectRow(db.prepare('SELECT * FROM projects WHERE id = ?').get(id));
  const requireProject = id => getProject(id) || reject(404, 'Проект не найден.');
  const referenceQuery = 'SELECT r.id,r.projectId,r.kind,r.title,r.url,r.fileName,r.mime,r.size,c.text AS clipText,c.capturedAt AS clipCapturedAt FROM project_references r LEFT JOIN reference_clips c ON c.referenceId=r.id';
  const referenceRow = row => {
    if (!row) return undefined;
    const { clipText, clipCapturedAt, ...reference } = row;
    return clipText === null ? reference : { ...reference, clip: { text: clipText, capturedAt: clipCapturedAt } };
  };
  const getReference = id => referenceRow(db.prepare(`${referenceQuery} WHERE r.id=?`).get(id));
  const planningRow = row => row ? { ...row, completed: Boolean(row.completed) } : undefined;
  const getPlanning = id => planningRow(db.prepare('SELECT * FROM project_planning WHERE id=?').get(id));
  const insertProject = project => db.prepare('INSERT INTO projects (id,parentId,name,description,category,art,coverId,createdAt,updatedAt,status,pinned,descriptionHtml) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').run(project.id, project.parentId, project.name, project.description, project.category, project.art, project.coverId, project.createdAt, project.updatedAt, project.status, Number(project.pinned), project.descriptionHtml);
  const transaction = work => {
    db.exec('BEGIN IMMEDIATE');
    try { const result = work(); db.exec('COMMIT'); return result; }
    catch (error) { db.exec('ROLLBACK'); throw error; }
  };
  if (!db.prepare("SELECT value FROM metadata WHERE key = 'initialized'").get()) {
    transaction(() => {
      if (seed) {
        const demos = [
          ['Личный сайт', 'Собрать портфолио с характером: отобрать лучшие работы, продумать историю и запустить первую версию.', 'Демо · Веб-дизайн', 'arch'],
          ['Музыкальный сервис', 'Исследовать, как находить музыку под настроение. Начать с концепции и прототипа экрана открытия.', 'Демо · Продукт', 'orbit'],
          ['Брендинг кофейни', 'Создать тёплый визуальный язык для небольшой кофейни: знак, палитра и упаковка.', 'Демо · Дизайн', 'layers'],
          ['Мобильная игра', 'Придумать небольшой игровой мир и основной цикл. Проверить идею на простом интерактивном прототипе.', 'Демо · Игра', 'bloom'],
        ];
        for (const [name, description, category, art] of demos) {
          const now = new Date().toISOString();
          insertProject({ id: randomUUID(), parentId: null, name, description, category, art, coverId: null, createdAt: now, updatedAt: now, status: 'in_progress', pinned: false, descriptionHtml: null });
        }
      }
      db.prepare("INSERT INTO metadata VALUES ('initialized', '1')").run();
    });
  }
  function validateProject(body, existing) {
    const project = { ...existing };
    if ('name' in body) project.name = textField(body.name, 'Название', 120);
    if ('description' in body) project.description = textField(body.description, 'Описание', 100000, true);
    if ('descriptionHtml' in body) {
      if (body.descriptionHtml !== null && !('description' in body)) reject(400, 'Передайте текст вместе с форматированием.');
      project.descriptionHtml = body.descriptionHtml === null ? null : textField(body.descriptionHtml, 'Форматированное описание', 200000, true);
    } else if ('description' in body) project.descriptionHtml = null;
    if ('category' in body) project.category = textField(body.category, 'Категория', 60, true).trim();
    if ('status' in body) {
      if (!STATUSES.includes(body.status)) reject(400, 'Неизвестный статус проекта.');
      project.status = body.status;
    }
    if ('pinned' in body) {
      if (typeof body.pinned !== 'boolean') reject(400, 'Некорректное закрепление проекта.');
      project.pinned = body.pinned;
    }
    if ('art' in body) {
      if (!ARTS.includes(body.art)) reject(400, 'Неизвестная иллюстрация.');
      project.art = body.art;
    }
    if ('parentId' in body) {
      if (body.parentId !== null && typeof body.parentId !== 'string') reject(400, 'Некорректный родительский проект.');
      let parent = body.parentId;
      const visited = new Set([project.id]);
      while (parent !== null) {
        if (visited.has(parent)) reject(400, 'Проект нельзя поместить внутрь самого себя.');
        visited.add(parent); parent = requireProject(parent).parentId;
      }
      if (body.parentId !== null && (requireProject(body.parentId).parentId !== null || db.prepare('SELECT 1 FROM projects WHERE parentId=? LIMIT 1').get(project.id))) reject(400, 'Некорректный родительский проект.');
      project.parentId = body.parentId;
    }
    if ('coverId' in body) {
      if (body.coverId !== null) {
        const ref = typeof body.coverId === 'string' && getReference(body.coverId);
        if (!ref || ref.kind !== 'image' || ref.projectId !== project.id) reject(400, 'Обложка должна быть изображением этого проекта.');
      }
      project.coverId = body.coverId;
    }
    return project;
  }
  function validatePlanning(body, existing) {
    const entry = { ...existing };
    if ('kind' in body && body.kind !== entry.kind) reject(400, 'Тип записи плана нельзя изменить.');
    if (!PLANNING_KINDS.includes(entry.kind)) reject(400, 'Неизвестный тип записи плана.');
    if ('date' in body) entry.date = body.date;
    if (typeof entry.date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(entry.date)) reject(400, 'Укажите корректную дату в формате ГГГГ-ММ-ДД.');
    const [year, month, day] = entry.date.split('-').map(Number);
    const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
    const days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
    if (year < 1 || month < 1 || month > 12 || day < 1 || day > days[month - 1]) reject(400, 'Укажите существующую календарную дату.');
    if ('title' in body) entry.title = body.title;
    const limit = entry.kind === 'note' ? 4000 : 120;
    if (typeof entry.title !== 'string' || !entry.title.trim() || entry.title.length > limit) reject(400, entry.kind === 'note' ? 'Заметка должна содержать от 1 до 4000 символов.' : 'Название этапа должно содержать от 1 до 120 символов.');
    entry.title = entry.title.trim();
    if ('completed' in body) entry.completed = body.completed;
    if (typeof entry.completed !== 'boolean') reject(400, 'Некорректная отметка выполнения этапа.');
    if (entry.kind === 'note' && entry.completed) reject(400, 'Отметка выполнения доступна только для этапов.');
    if (['start', 'deadline'].includes(entry.kind)) {
      if (db.prepare('SELECT id FROM project_planning WHERE projectId=? AND kind=? AND id<>?').get(entry.projectId, entry.kind, entry.id)) reject(400, 'В проекте уже есть такой этап: старт или дедлайн.');
      const opposite = db.prepare('SELECT date FROM project_planning WHERE projectId=? AND kind=?').get(entry.projectId, entry.kind === 'start' ? 'deadline' : 'start');
      if (opposite && (entry.kind === 'start' ? entry.date > opposite.date : entry.date < opposite.date)) reject(400, 'Дедлайн не может быть раньше старта проекта.');
    }
    if (entry.kind === 'note' && db.prepare("SELECT id FROM project_planning WHERE projectId=? AND kind='note' AND date=? AND id<>?").get(entry.projectId, entry.date, entry.id)) reject(400, 'На эту дату уже есть заметка. Отредактируйте её.');
    return entry;
  }
  function createProject(body, id = randomUUID()) {
    const now = new Date().toISOString();
    const project = validateProject(body, { id, parentId: null, name: '', description: '', category: 'Проект', art: 'orbit', coverId: null, createdAt: now, updatedAt: now, status: 'planned', pinned: false, descriptionHtml: null });
    if (!project.name) reject(400, 'Укажите название проекта.');
    insertProject(project);
    return project;
  }
  function updateProject(id, body) {
    const previousParent = requireProject(id).parentId;
    const project = validateProject(body, requireProject(id));
    project.updatedAt = new Date().toISOString();
    db.prepare('UPDATE projects SET parentId=?, name=?, description=?, category=?, art=?, coverId=?, updatedAt=?, status=?, pinned=?, descriptionHtml=? WHERE id=?').run(project.parentId, project.name, project.description, project.category, project.art, project.coverId, project.updatedAt, project.status, Number(project.pinned), project.descriptionHtml, project.id);
    if (previousParent !== project.parentId) db.prepare('DELETE FROM project_priority WHERE projectId=?').run(id);
    return project;
  }
  function createPlanEntry(projectId, body, id = randomUUID()) {
    requireProject(projectId);
    const entry = validatePlanning(body, { id, projectId, kind: body.kind, date: '', title: '', completed: false });
    db.prepare('INSERT INTO project_planning (id,projectId,kind,date,title,completed) VALUES (?,?,?,?,?,?)').run(entry.id, entry.projectId, entry.kind, entry.date, entry.title, Number(entry.completed));
    return entry;
  }
  function createLink(projectId, body, id = randomUUID()) {
    requireProject(projectId);
    let url;
    try { url = new URL(body.url); } catch { reject(400, 'Введите корректную ссылку.'); }
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) reject(400, 'Разрешены только ссылки HTTP и HTTPS без паролей.');
    if (url.href.length > 4096) reject(400, 'Ссылка слишком длинная.');
    const ref = { id, projectId, kind: 'link', title: textField(body.title || url.hostname, 'Название ссылки', 200), url: url.href, fileName: null, mime: null, size: null };
    db.prepare('INSERT INTO project_references (id,projectId,kind,title,url,fileName,mime,size,storedName) VALUES (?,?,?,?,?,?,?,?,?)').run(ref.id, ref.projectId, ref.kind, ref.title, ref.url, null, null, null, null);
    return ref;
  }
  const assistantWorkspace = () => ({
    projects: orderedProjects(),
    planningEntries: db.prepare('SELECT * FROM project_planning ORDER BY rowid').all().map(planningRow),
    references: db.prepare('SELECT id,projectId,kind,title,url FROM project_references ORDER BY rowid').all(),
  });
  function resolveAssistantProject(reference) {
    if (typeof reference !== 'string') throw assistantError('ai_target');
    const projects = db.prepare('SELECT * FROM projects').all().map(projectRow);
    const byId = projects.find(project => project.id === reference);
    if (byId) return byId;
    const matches = projects.filter(project => project.name.toLocaleLowerCase() === reference.trim().toLocaleLowerCase());
    if (matches.length !== 1) throw assistantError('ai_target');
    return matches[0];
  }
  function performAssistantActions(actions) {
    return actions.map(({tool,args,id}) => {
      const {project:reference,parent,...fields} = args;
      if (tool === 'create_project' || tool === 'create_subproject') {
        const parentId = parent ? resolveAssistantProject(parent).id : null;
        const created = createProject({...fields,category:fields.category ?? '',parentId,art:ARTS[parseInt(id.slice(0,8),16)%ARTS.length]},id);
        return {tool,projectId:created.id,projectName:created.name,before:null,changes:{name:created.name,parent:parentId ? requireProject(parentId).name : null,...fields}};
      }
      const project = resolveAssistantProject(reference);
      if (tool === 'open_project') return {tool,projectId:project.id,projectName:project.name,before:null,changes:{}};
      if (tool === 'update_project') {
        updateProject(project.id, fields);
        return {tool,projectId:project.id,projectName:project.name,before:Object.fromEntries(Object.keys(fields).map(key=>[key,project[key]])),changes:fields};
      }
      if (tool === 'add_plan_entry') createPlanEntry(project.id,fields,id);
      else if (tool === 'add_link') createLink(project.id,fields,id);
      else throw assistantError('ai_invalid');
      return {tool,projectId:project.id,projectName:project.name,before:null,changes:fields};
    });
  }
  const assistantSetup = createAssistantSetup({fetchImpl:assistantFetch,runtime:assistantRuntime,
    getModel: () => db.prepare("SELECT value FROM metadata WHERE key='assistantModel'").get()?.value,
    setModel: model => db.prepare("INSERT INTO metadata (key,value) VALUES ('assistantModel',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value").run(model),
  });
  const assistant = createAssistant({workspace:assistantWorkspace,fetchImpl:assistantFetch,getModel:signal=>assistantSetup.inferenceModel(signal),
    preview: actions => {
      db.exec('SAVEPOINT assistant_preview');
      try { return performAssistantActions(actions); }
      finally { db.exec('ROLLBACK TO assistant_preview; RELEASE assistant_preview'); }
    },
    commit: actions => transaction(()=>({operations:performAssistantActions(actions)})),
  });
  function checkRequest(req) {
    let host;
    try { host = new URL(`http://${req.headers.host}`).hostname; } catch { reject(403, 'Недопустимый адрес.'); }
    if (!['127.0.0.1', 'localhost'].includes(host)) reject(403, 'Доступ разрешён только локально.');
    if (['POST', 'PATCH', 'DELETE', 'PUT'].includes(req.method)) {
      if (req.headers['sec-fetch-site'] === 'cross-site') reject(403, 'Запрос с другого сайта запрещён.');
      if (req.headers.origin) {
        const port = server.address()?.port;
        const allowed = [4317, 5173, port].flatMap(p => [`http://127.0.0.1:${p}`, `http://localhost:${p}`]);
        if (!allowed.includes(req.headers.origin)) reject(403, 'Запрос с другого сайта запрещён.');
      }
    }
  }
  function send(res, status, value) {
    res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
    res.end(value === undefined ? undefined : JSON.stringify(value));
  }
  async function removeFiles(names) {
    for (const name of names) {
      try { await unlink(path.join(filesDir, name)); }
      catch (error) { if (error.code !== 'ENOENT') throw error; }
    }
  }
  const server = createServer(async (req, res) => {
    res.setHeader('Content-Security-Policy', "frame-ancestors 'none'");
    res.setHeader('X-Frame-Options', 'DENY');
    try {
      checkRequest(req);
      let pathname;
      try { pathname = decodeURIComponent(new URL(req.url, 'http://127.0.0.1').pathname); }
      catch { reject(400, 'Некорректный адрес.'); }
      const method = req.method;
      if (accessToken && pathname.startsWith('/api/')) {
        const session = req.headers.cookie?.split(';').map(value => value.trim()).find(value => value.startsWith('sidequest_session='))?.slice('sidequest_session='.length);
        if (session !== accessToken) reject(403, 'Эта сессия приложения недействительна.');
      }
      if (method === 'GET' && pathname === '/api/assistant') return send(res,200,await assistantSetup.status());
      if (pathname === '/api/assistant/setup' && method === 'POST') {
        if (assistant.busy()) throw assistantError('ai_busy',409);
        return send(res,202,await assistantSetup.start(await jsonBody(req)));
      }
      if (pathname === '/api/assistant/setup' && method === 'DELETE') return send(res,200,await assistantSetup.cancel());
      if (pathname === '/api/assistant/model' && method === 'PATCH') {
        if (assistant.busy()) throw assistantError('ai_busy',409);
        const body = await jsonBody(req);
        if (Object.keys(body).some(key=>key!=='model')) throw assistantError('ai_invalid');
        return send(res,200,await assistantSetup.select(body.model));
      }
      if (method === 'POST' && pathname === '/api/assistant/plan') {
        if (assistantSetup.busy()) throw assistantError('ai_busy',409);
        const body = await jsonBody(req);
        const controller = new AbortController();
        const cancel = () => controller.abort();
        res.once('close',cancel);
        try { return send(res,200,await assistant.plan({...body,language:getLanguage()},controller.signal)); }
        finally { res.off('close',cancel); }
      }
      const assistantMatch = pathname.match(/^\/api\/assistant\/plans\/([a-f0-9-]+)$/);
      if (assistantMatch && method === 'POST') return send(res,200,assistant.apply(assistantMatch[1]));
      if (assistantMatch && method === 'DELETE') { assistant.discard(assistantMatch[1]); return send(res,204); }
      if (method === 'GET' && pathname === '/api/dictation') {
        const status = await transcriber.status();
        return send(res, 200, requestDictationMicrophone ? {...status, microphoneAuthorization: true} : status);
      }
      if (requestDictationMicrophone && pathname === '/api/dictation/prepare' && method === 'POST') {
        if (!(await requestDictationMicrophone())) reject(403, 'Разрешите ProjiSpace доступ к микрофону в системных настройках macOS.');
        return send(res, 204);
      }
      if (pathname === '/api/dictation/model' && method === 'POST') {
        await transcriber.startDownload();
        return send(res, 202, await transcriber.status());
      }
      if (pathname === '/api/dictation/model' && method === 'DELETE') {
        await transcriber.cancelDownload();
        return send(res, 200, await transcriber.status());
      }
      if (pathname === '/api/dictation/transcribe' && method === 'POST') {
        if (req.headers['content-type'] !== 'audio/wav') reject(415, 'Ожидается запись WAV.');
        const language = new URL(req.url, 'http://localhost').searchParams.get('language') || 'auto';
        if (!['auto','ru','en'].includes(language)) reject(400, 'Неверный язык речи.');
        const audio = await readBody(req, 3840044);
        const controller = new AbortController();
        const cancel = () => { if (!res.writableEnded) controller.abort(); };
        res.once('close', cancel);
        try { return send(res, 200, {text: await transcriber.transcribe(audio, {signal: controller.signal, language})}); }
        finally { res.off('close', cancel); }
      }
      if (pathname === '/api/storage') {
        if (method === 'GET') return send(res, 200, storage ? storage.status() : { available: false, currentPath: dataDir, pendingPath: null });
        if (!storage) reject(404, 'Выбор папки доступен в настольном приложении.');
        if (method === 'POST') return send(res, 200, await storage.choose());
        if (method === 'DELETE') return send(res, 200, await storage.cancel());
      }
      if (method === 'GET' && pathname === '/api/projects') {
        return send(res, 200, {
          projects: orderedProjects(),
          references: db.prepare(`${referenceQuery} ORDER BY r.rowid`).all().map(referenceRow),
          planningEntries: db.prepare('SELECT * FROM project_planning ORDER BY date, rowid').all().map(planningRow),
          storagePath: dataDir,
          referencePanelWidth: Number(db.prepare("SELECT value FROM metadata WHERE key = 'referencePanelWidth'").get()?.value ?? 265),
          projectsPanelWidth: Number(db.prepare("SELECT value FROM metadata WHERE key = 'projectsPanelWidth'").get()?.value) || null,
          projectsPanelCollapsed: db.prepare("SELECT value FROM metadata WHERE key = 'projectsPanelCollapsed'").get()?.value === 'true',
          planCollapsed: db.prepare("SELECT value FROM metadata WHERE key = 'planCollapsed'").get()?.value === 'true',
          pickerTheme: db.prepare("SELECT value FROM metadata WHERE key = 'pickerTheme'").get()?.value === 'tech' ? 'tech' : 'game',
          accentColor: 'blue',
          appearance: db.prepare("SELECT value FROM metadata WHERE key = 'appearance'").get()?.value === 'light' ? 'light' : 'dark',
          language: getLanguage(),
        });
      }
      if (method === 'PATCH' && pathname === '/api/preferences') {
        const body = await jsonBody(req);
        if (!PREFERENCES.some(key => key in body)) reject(400, 'Передайте настройки интерфейса.');
        if ('referencePanelWidth' in body && (!Number.isInteger(body.referencePanelWidth) || body.referencePanelWidth < 200 || body.referencePanelWidth > 560)) reject(400, 'Ширина панели должна быть от 200 до 560 пикселей.');
        if ('projectsPanelWidth' in body && (!Number.isInteger(body.projectsPanelWidth) || body.projectsPanelWidth < 190 || body.projectsPanelWidth > 420)) reject(400, 'Ширина панели проектов должна быть от 190 до 420 пикселей.');
        if ('language' in body && !supportedLanguages.includes(body.language)) reject(400, 'Неизвестный язык интерфейса.');
        if ('pickerTheme' in body && !['game','tech'].includes(body.pickerTheme)) reject(400, 'Неизвестная тема карточек.');
        if ('accentColor' in body && body.accentColor !== 'blue') reject(400, 'Неизвестный цвет интерфейса.');
        if ('appearance' in body && !['dark','light'].includes(body.appearance)) reject(400, 'Неизвестная тема интерфейса.');
        for (const key of ['projectsPanelCollapsed','planCollapsed']) if (key in body && typeof body[key] !== 'boolean') reject(400, 'Неверное состояние панели.');
        transaction(() => {
          for (const key of PREFERENCES) if (key in body) db.prepare('INSERT INTO metadata (key,value) VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value').run(key,String(body[key]));
        });
        return send(res, 204);
      }
      if (method === 'PATCH' && pathname === '/api/projects/order') {
        const { ids } = await jsonBody(req);
        const invalid = () => reject(409, 'Не удалось сохранить изменения. Попробуйте ещё раз.');
        if (!Array.isArray(ids) || !ids.length || ids.some(id => typeof id !== 'string') || new Set(ids).size !== ids.length) invalid();
        const parent = requireProject(ids[0]).parentId;
        const siblings = db.prepare('SELECT id FROM projects WHERE parentId IS ?').all(parent);
        if (ids.length !== siblings.length || siblings.some(p => !ids.includes(p.id))) invalid();
        transaction(() => {
          const update = db.prepare('INSERT INTO project_priority (projectId,position) VALUES (?,?) ON CONFLICT(projectId) DO UPDATE SET position=excluded.position');
          ids.forEach((id, position) => update.run(id, position));
        });
        return send(res, 204);
      }
      if (method === 'POST' && pathname === '/api/projects') {
        return send(res, 201, createProject(await jsonBody(req)));
      }
      let match = pathname.match(/^\/api\/projects\/([a-f0-9-]+)$/);
      if (match && method === 'PATCH') {
        return send(res, 200, updateProject(match[1],await jsonBody(req)));
      }
      if (match && method === 'DELETE') {
        requireProject(match[1]);
        const names = db.prepare(`WITH RECURSIVE descendants(id) AS (SELECT ? UNION ALL SELECT p.id FROM projects p JOIN descendants d ON p.parentId=d.id)
          SELECT storedName FROM project_references WHERE projectId IN (SELECT id FROM descendants) AND storedName IS NOT NULL`).all(match[1]).map(row => row.storedName);
        db.prepare('DELETE FROM projects WHERE id=?').run(match[1]); await removeFiles(names);
        return send(res, 204);
      }
      match = pathname.match(/^\/api\/projects\/([a-f0-9-]+)\/planning$/);
      if (match && method === 'POST') {
        return send(res, 201, createPlanEntry(match[1],await jsonBody(req)));
      }
      match = pathname.match(/^\/api\/planning\/([a-f0-9-]+)$/);
      if (match && ['PATCH', 'DELETE'].includes(method)) {
        const existing = getPlanning(match[1]);
        if (!existing) reject(404, 'Запись плана не найдена.');
        if (method === 'DELETE') {
          db.prepare('DELETE FROM project_planning WHERE id=?').run(existing.id);
          return send(res, 204);
        }
        const body = await jsonBody(req);
        if ('kind' in body) reject(400, 'Тип записи плана нельзя изменить.');
        const entry = validatePlanning(body, existing);
        db.prepare('UPDATE project_planning SET date=?, title=?, completed=? WHERE id=?').run(entry.date, entry.title, Number(entry.completed), entry.id);
        return send(res, 200, entry);
      }
      match = pathname.match(/^\/api\/projects\/([a-f0-9-]+)\/(links|images)$/);
      if (match && method === 'POST') {
        if (match[2] === 'links') return send(res,201,createLink(match[1],await jsonBody(req)));
        requireProject(match[1]); const id = randomUUID();
        let ref; let storedName = null;
        {
          const mime = req.headers['content-type']?.split(';')[0].trim();
          if (!IMAGE_TYPES.has(mime)) reject(415, 'Поддерживаются PNG, JPG, WebP и GIF.');
          const buffer = await readBody(req, 20 * 1024 * 1024);
          if (!validImage(buffer, mime)) reject(400, 'Содержимое файла не соответствует типу изображения.');
          let fileName;
          try { fileName = decodeURIComponent(req.headers['x-file-name'] || `image.${IMAGE_TYPES.get(mime)}`); }
          catch { reject(400, 'Некорректное имя файла.'); }
          fileName = textField(fileName.split(/[\\/]/).pop(), 'Имя файла', 255);
          storedName = `${id}.${IMAGE_TYPES.get(mime)}`;
          await writeFile(path.join(filesDir, storedName), buffer, { flag: 'wx' });
          ref = { id, projectId: match[1], kind: 'image', title: fileName, url: `/api/files/${id}`, fileName, mime, size: buffer.length };
        }
        try { db.prepare('INSERT INTO project_references VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)').run(...Object.values(ref), storedName); }
        catch (error) { if (storedName) await removeFiles([storedName]); throw error; }
        return send(res, 201, ref);
      }
      match = pathname.match(/^\/api\/references\/([a-f0-9-]+)\/annotations$/);
      if (match && ['GET', 'PUT'].includes(method)) {
        const ref = getReference(match[1]);
        if (!ref || ref.kind !== 'image') reject(404, 'Изображение не найдено.');
        if (method === 'GET') return send(res, 200, JSON.parse(db.prepare('SELECT data FROM reference_annotations WHERE referenceId=?').get(ref.id)?.data || '[]'));
        const { annotations } = await jsonBody(req);
        const invalid = () => reject(400, 'Не удалось сохранить изменения. Попробуйте ещё раз.');
        if (!Array.isArray(annotations) || annotations.length > 500) invalid();
        let count = 0;
        const clean = annotations.map(mark => {
          if (!mark || !['pen','marker','line','arrow','rectangle','ellipse'].includes(mark.tool) || typeof mark.color !== 'string' || !/^#[a-f0-9]{6}$/i.test(mark.color) || !Number.isFinite(mark.width) || mark.width < 0.0001 || mark.width > 0.1 || !Array.isArray(mark.points)) invalid();
          count += mark.points.length;
          if (!mark.points.length || mark.points.length > 5000 || count > 20000 || (!['pen','marker'].includes(mark.tool) && mark.points.length !== 2)) invalid();
          const points = mark.points.map(point => {
            if (!Array.isArray(point) || point.length !== 2 || point.some(value => !Number.isFinite(value) || value < 0 || value > 1)) invalid();
            return [point[0],point[1]];
          });
          return {tool:mark.tool,color:mark.color,width:mark.width,points};
        });
        db.prepare('INSERT INTO reference_annotations (referenceId,data) VALUES (?,?) ON CONFLICT(referenceId) DO UPDATE SET data=excluded.data').run(ref.id,JSON.stringify(clean));
        return send(res, 204);
      }
      match = pathname.match(/^\/api\/references\/([a-f0-9-]+)$/);
      if (match && method === 'DELETE') {
        const ref = db.prepare('SELECT * FROM project_references WHERE id=?').get(match[1]);
        if (!ref) reject(404, 'Референс не найден.');
        transaction(() => {
          db.prepare('UPDATE projects SET coverId=NULL WHERE coverId=?').run(ref.id);
          db.prepare('DELETE FROM project_references WHERE id=?').run(ref.id);
        });
        if (ref.storedName) await removeFiles([ref.storedName]);
        return send(res, 204);
      }
      match = pathname.match(/^\/api\/files\/([a-f0-9-]+)$/);
      if (match && ['GET', 'HEAD'].includes(method)) {
        const ref = db.prepare("SELECT * FROM project_references WHERE id=? AND kind='image'").get(match[1]);
        if (!ref) reject(404, 'Изображение не найдено.');
        const buffer = await readFile(path.join(filesDir, ref.storedName));
        res.writeHead(200, { 'Content-Type': ref.mime, 'Content-Length': buffer.length, 'Cache-Control': 'private, max-age=86400', 'X-Content-Type-Options': 'nosniff', 'Content-Disposition': 'inline' });
        return res.end(method === 'HEAD' ? undefined : buffer);
      }
      if (pathname.startsWith('/api/')) reject(404, 'Адрес не найден.');
      if (!['GET', 'HEAD'].includes(method)) reject(405, 'Метод не поддерживается.');
      const requested = path.resolve(distDir, `.${pathname}`);
      const relative = path.relative(path.resolve(distDir), requested);
      if (relative.startsWith('..') || path.isAbsolute(relative) || pathname.includes('\0') || pathname.includes('\\')) reject(404, 'Файл не найден.');
      let target = requested;
      try { if (!(await stat(target)).isFile()) target = path.join(distDir, 'index.html'); }
      catch { target = path.join(distDir, 'index.html'); }
      let buffer;
      try { buffer = await readFile(target); }
      catch (error) { if (error.code === 'ENOENT') reject(404, 'Сначала выполните npm run build или используйте npm run dev.'); throw error; }
      const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.webp': 'image/webp', '.ico': 'image/x-icon', '.woff2': 'font/woff2', '.ttf': 'font/ttf', '.txt': 'text/plain; charset=utf-8' };
      res.writeHead(200, { 'Content-Type': types[path.extname(target)] || 'application/octet-stream', 'Cache-Control': path.extname(target) === '.html' ? 'no-cache' : 'public, max-age=3600', 'X-Content-Type-Options': 'nosniff' });
      res.end(method === 'HEAD' ? undefined : buffer);
    } catch (error) {
      if (!(error instanceof RequestError)) console.error('Ошибка локального сервера:', error.message);
      const requested = (req.headers['accept-language'] || '').split(',').map((part, index) => {
        const [tag, ...parameters] = part.trim().split(';');
        const quality = parameters.find(value => value.trim().startsWith('q='));
        return { language: tag.toLowerCase().split('-')[0], quality: quality ? Number(quality.trim().slice(2)) : 1, index };
      }).filter(value => supportedLanguages.includes(value.language) && value.quality > 0 && value.quality <= 1).sort((a,b) => b.quality-a.quality || a.index-b.index);
      const language = requested[0]?.language || getLanguage();
      let message = error.status ? error.message : 'Не удалось сохранить данные. Проверьте доступ к локальной папке.';
      const field = message.match(/^Проверьте поле «(.+)»\.$/);
      message = field ? translate('Проверьте поле «{field}».', language, { field: translate(field[1], language) }) : translate(message, language);
      if (!res.headersSent) send(res, error.status || 500, { error: message });
      else res.end();
    }
  });
  function getLanguage() { const language = db.prepare("SELECT value FROM metadata WHERE key = 'language'").get()?.value; return supportedLanguages.includes(language) ? language : language ? 'en' : 'ru'; }
  return { server, getLanguage, close: async () => { assistant.close(); await assistantSetup.close(); await transcriber.close(); if (server.listening) await new Promise((resolve, rejectClose) => server.close(error => error ? rejectClose(error) : resolve())); db.close(); } };
}
