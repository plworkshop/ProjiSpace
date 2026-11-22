import test from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import {
  mkdtemp,
  mkdir,
  readFile,
  writeFile,
  readdir,
  rm,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { createApp } from "../server/app.mjs";
import { externalUrl, importWorkspace, readWindowState } from "./data.mjs";

async function fixture(t) {
  const root = await mkdtemp(path.join(tmpdir(), "sidequest-desktop-"));
  const source = path.join(root, "web");
  const data = path.join(root, "profile", "data");
  const service = await createApp({ dataDir: source });
  const db = new DatabaseSync(path.join(source, "sidequest.sqlite"));
  t.after(async () => {
    db.close();
    await service.close();
    await rm(root, { recursive: true, force: true });
  });
  return { root, source, data, db };
}

test("desktop import preserves committed WAL data, formatting, pins, statuses and images", async (t) => {
  const { source, data, db } = await fixture(t);
  const project = db.prepare("SELECT * FROM projects LIMIT 1").get();
  const referenceId = "00000000-0000-0000-0000-000000000001";
  const storedName = `${referenceId}.png`;
  const image = Buffer.from("desktop migration test image");
  db.prepare(
    "UPDATE projects SET description=?, descriptionHtml=?, pinned=1, status=?, coverId=? WHERE id=?",
  ).run(
    "Важный текст",
    "<p><strong>Важный текст</strong></p>",
    "paused",
    referenceId,
    project.id,
  );
  db.prepare("INSERT INTO project_references VALUES (?,?,?,?,?,?,?,?,?)").run(
    referenceId,
    project.id,
    "image",
    "Обложка",
    `/api/files/${referenceId}`,
    "cover.png",
    "image/png",
    image.length,
    storedName,
  );
  await writeFile(path.join(source, "files", storedName), image);
  const original = db.prepare("SELECT * FROM projects ORDER BY rowid").all();
  const imported = await importWorkspace(source, data);
  assert.equal(imported.projects, 4);
  assert.equal(imported.images, 1);
  const copy = new DatabaseSync(path.join(data, "sidequest.sqlite"));
  assert.deepEqual(
    copy.prepare("SELECT * FROM projects ORDER BY rowid").all(),
    original,
  );
  assert.deepEqual(await readFile(path.join(data, "files", storedName)), image);
  assert.deepEqual(
    await readFile(path.join(data, "backups", "before-desktop-import.sqlite")),
    await readFile(path.join(data, "sidequest.sqlite")),
  );
  copy
    .prepare("UPDATE projects SET name=? WHERE id=?")
    .run("Изменение только в desktop", project.id);
  copy.close();
  assert.equal(
    db.prepare("SELECT name FROM projects WHERE id=?").get(project.id).name,
    project.name,
  );
  assert.deepEqual(await importWorkspace(source, data), { imported: false });
});

test("failed imports do not create a partial workspace or alter the source", async (t) => {
  const { root, source, data, db } = await fixture(t);
  const project = db.prepare("SELECT id FROM projects LIMIT 1").get();
  db.prepare("INSERT INTO project_references VALUES (?,?,?,?,?,?,?,?,?)").run(
    "missing",
    project.id,
    "image",
    "Файл",
    "/api/files/missing",
    "missing.png",
    "image/png",
    1,
    "00000000-0000-0000-0000-000000000001.png",
  );
  await assert.rejects(importWorkspace(source, data), { code: "ENOENT" });
  assert.deepEqual(await readdir(path.join(root, "profile")), []);
  assert.equal(
    db.prepare("SELECT count(*) AS count FROM projects").get().count,
    4,
  );
});

test("window preferences are bounded and external links allow only web and mail protocols", async (t) => {
  const profile = await mkdtemp(path.join(tmpdir(), "sidequest-window-"));
  t.after(() => rm(profile, { recursive: true, force: true }));
  assert.deepEqual(await readWindowState(profile), {
    width: 1280,
    height: 850,
    maximized: false,
  });
  await writeFile(
    path.join(profile, "window.json"),
    JSON.stringify({ width: -1, height: 99999, maximized: true }),
  );
  assert.deepEqual(await readWindowState(profile), {
    width: 900,
    height: 1600,
    maximized: true,
  });
  await writeFile(path.join(profile, "window.json"), "{");
  assert.equal((await readWindowState(profile)).width, 1280);
  assert.equal(
    externalUrl("https://example.com/reference"),
    "https://example.com/reference",
  );
  assert.equal(
    externalUrl("mailto:support@example.com"),
    "mailto:support@example.com",
  );
  for (const url of [
    "file:///C:/Windows/system32",
    "javascript:alert(1)",
    "data:text/html,test",
    "https://user:password@example.com",
    "not a url",
  ])
    assert.equal(externalUrl(url), null);
});
