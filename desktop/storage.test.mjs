import test from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { mkdtemp, mkdir, readFile, readdir, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { openStorage } from "./storage.mjs";
import { createApp } from "../server/app.mjs";

async function fixture(t) {
  const root = await mkdtemp(path.join(tmpdir(), "projispace-storage-"));
  const profile = path.join(root, "profile");
  const source = path.join(profile, "data");
  const target = path.join(root, "Новое хранилище");
  await mkdir(target);
  const service = await createApp({ dataDir: source });
  let closed = false;
  const close = async () => { if (!closed) { closed = true; await service.close(); } };
  t.after(async () => { await close(); await rm(root, { recursive: true, force: true }); });
  return { root, profile, source, target, close };
}

test("storage moves a final SQLite snapshot, images, settings and models on restart and keeps the source", async (t) => {
  const { profile, source, target, close } = await fixture(t);
  const manager = await openStorage(profile, async () => target);
  assert.equal(manager.directory, source);
  assert.equal((await manager.choose()).pendingPath, await realpath(target));
  assert.deepEqual(await readdir(target), []);
  const db = new DatabaseSync(path.join(source, "sidequest.sqlite"));
  const id = "00000000-0000-0000-0000-000000000001";
  const project = db.prepare("SELECT id FROM projects LIMIT 1").get();
  db.prepare("UPDATE projects SET name=?, status='completed' WHERE id=?").run("Saved after folder selection", project.id);
  const image = Buffer.from("image content");
  db.prepare("INSERT INTO project_references VALUES (?,?,?,?,?,?,?,?,?)").run(id, project.id, "image", "Cover", `/api/files/${id}`, "cover.png", "image/png", image.length, `${id}.png`);
  await writeFile(path.join(source, "files", `${id}.png`), image);
  await mkdir(path.join(source, "voice"));
  await writeFile(path.join(source, "voice", "model.bin"), "cached model");
  await mkdir(path.join(source, "backups"));
  await writeFile(path.join(source, "backups", "old.sqlite"), "backup");
  await close();
  // Leave the second connection open to exercise committed WAL data as well.
  db.prepare("INSERT INTO metadata (key,value) VALUES ('language','en')").run();
  let moved;
  try { moved = await openStorage(profile, async () => null); }
  finally { db.close(); }
  assert.equal(moved.warning, null);
  assert.equal(moved.status().pendingPath, null);
  assert.equal(moved.directory, await realpath(target));
  const snapshot = new DatabaseSync(path.join(moved.directory, "sidequest.sqlite"), { readOnly: true });
  try {
    assert.equal(snapshot.prepare("SELECT name FROM projects WHERE id=?").get(project.id).name, "Saved after folder selection");
    assert.equal(snapshot.prepare("SELECT status FROM projects WHERE id=?").get(project.id).status, "completed");
    assert.equal(snapshot.prepare("SELECT value FROM metadata WHERE key='language'").get().value, "en");
    assert.equal(snapshot.prepare("PRAGMA quick_check").get().quick_check, "ok");
  } finally { snapshot.close(); }
  assert.deepEqual(await readFile(path.join(target, "files", `${id}.png`)), image);
  assert.deepEqual(await readFile(path.join(source, "files", `${id}.png`)), image);
  assert.equal(await readFile(path.join(target, "voice", "model.bin"), "utf8"), "cached model");
  assert.equal(await readFile(path.join(target, "backups", "old.sqlite"), "utf8"), "backup");
  const restarted = await openStorage(profile, async () => null);
  const service = await createApp({ dataDir: restarted.directory, seed: false });
  await service.close();
  assert.equal(restarted.directory, moved.directory);
});

test("storage selection can be dismissed or canceled without moving anything", async (t) => {
  const { profile, source, target } = await fixture(t);
  const dismissed = await openStorage(profile, async () => null);
  assert.equal((await dismissed.choose()).pendingPath, null);
  const manager = await openStorage(profile, async () => target);
  await manager.choose();
  assert.equal((await manager.cancel()).pendingPath, null);
  assert.equal((await openStorage(profile, async () => null)).directory, source);
  assert.deepEqual(await readdir(target), []);
});

test("storage rejects overlapping and nonempty destinations without touching their files", async (t) => {
  const { profile, source, target } = await fixture(t);
  await writeFile(path.join(target, "keep.txt"), "keep");
  for (const destination of [source, profile, path.join(source, "files"), target]) {
    const manager = await openStorage(profile, async () => destination);
    await assert.rejects(manager.choose(), (error) => error.status === 400);
    assert.equal(manager.status().pendingPath, null);
  }
  assert.equal(await readFile(path.join(target, "keep.txt"), "utf8"), "keep");
});

test("a destination changed before restart falls back to the original and clears the pending move", async (t) => {
  const { profile, source, target, close } = await fixture(t);
  const manager = await openStorage(profile, async () => target);
  await manager.choose();
  await writeFile(path.join(target, "keep.txt"), "new file");
  await close();
  const failed = await openStorage(profile, async () => null);
  assert.ok(failed.warning);
  assert.equal(failed.directory, source);
  assert.equal(failed.status().pendingPath, null);
  assert.equal(await readFile(path.join(target, "keep.txt"), "utf8"), "new file");
});

test("missing image aborts the copy, preserves the old workspace and cleans its staging folder", async (t) => {
  const { root, profile, source, target, close } = await fixture(t);
  const db = new DatabaseSync(path.join(source, "sidequest.sqlite"));
  const project = db.prepare("SELECT id FROM projects LIMIT 1").get();
  const id = "00000000-0000-0000-0000-000000000001";
  db.prepare("INSERT INTO project_references VALUES (?,?,?,?,?,?,?,?,?)").run(id, project.id, "image", "Missing", `/api/files/${id}`, "cover.png", "image/png", 5, `${id}.png`);
  db.close();
  await (await openStorage(profile, async () => target)).choose();
  await close();
  const failed = await openStorage(profile, async () => null);
  assert.ok(failed.warning);
  assert.equal(failed.directory, source);
  assert.deepEqual(await readdir(target), []);
  assert.equal((await readdir(root)).some(name => name.startsWith(".projispace-storage-")), false);
});

test("unavailable configured storage never silently creates an empty workspace", async (t) => {
  const { root, profile, close } = await fixture(t);
  await close();
  const missing = path.join(root, "unavailable-drive");
  await writeFile(path.join(profile, "storage-location.json"), JSON.stringify({ directory: missing, pendingPath: null }));
  await assert.rejects(openStorage(profile, async () => null));
  await assert.rejects(readFile(path.join(missing, "sidequest.sqlite")), { code: "ENOENT" });
  await writeFile(path.join(profile, "storage-location.json"), "{}");
  await assert.rejects(openStorage(profile, async () => null), /настройки/);
});
