import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, mkdir, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { DatabaseSync } from "node:sqlite";
import { createApp } from "../server/app.mjs";

const root = fileURLToPath(new URL("../", import.meta.url));
const require = createRequire(import.meta.url);
const electron = require("electron");
const temp = await mkdtemp(path.join(tmpdir(), "sidequest-electron-"));
try {
  const source = path.join(temp, "web");
  const profile = path.join(temp, "profile");
  await mkdir(profile);
  const service = await createApp({ dataDir: source });
  await service.close();
  const sourceDb = new DatabaseSync(path.join(source, "sidequest.sqlite"));
  sourceDb
    .prepare("INSERT INTO metadata (key,value) VALUES ('language','en')")
    .run();
  sourceDb
    .prepare(
      "INSERT INTO metadata (key,value) VALUES ('projectsPanelWidth','350'),('referencePanelWidth','315')",
    )
    .run();
  sourceDb.close();
  const report = path.join(root, "qa", "desktop-smoke.json");
  await mkdir(path.dirname(report), { recursive: true });
  const runDesktop = (output, extra = []) => new Promise((resolve, reject) => {
    const child = spawn(
      electron,
      [path.join(root, "desktop", "smoke.mjs"), profile, source, output, ...extra],
      { cwd: root, stdio: "inherit", windowsHide: true },
    );
    const timeout = setTimeout(() => {
      child.kill();
      reject(new Error("Desktop smoke test timed out"));
    }, 45000);
    child.once("error", (error) => {
      clearTimeout(timeout);
      reject(error);
    });
    child.once("exit", (code) => {
      clearTimeout(timeout);
      resolve(code);
    });
  });
  assert.equal(await runDesktop(report), 0);
  const db = new DatabaseSync(path.join(profile, "data", "sidequest.sqlite"), {
    readOnly: true,
  });
  const project = db
    .prepare("SELECT * FROM projects ORDER BY rowid LIMIT 1")
    .get();
  assert.equal(project.pinned, 1);
  assert.equal(project.status, "paused");
  assert.equal(
    db
      .prepare("SELECT value FROM metadata WHERE key = 'projectsPanelWidth'")
      .get().value,
    "350",
  );
  assert.equal(
    db
      .prepare("SELECT value FROM metadata WHERE key = 'referencePanelWidth'")
      .get().value,
    "315",
  );
  assert.equal(
    db.prepare("SELECT value FROM metadata WHERE key = 'language'").get().value,
    "en",
  );
  assert.equal(
    project.descriptionHtml,
    "<p><strong>Desktop</strong> проверка</p>",
  );
  db.close();
  const result = JSON.parse(await readFile(report, "utf8"));
  const restartReport = path.join(root, "qa", "desktop-storage-relaunch.json");
  assert.equal(await runDesktop(restartReport, ["--storage-relaunch"]), 0);
  const restarted = JSON.parse(await readFile(restartReport, "utf8"));
  assert.equal(restarted.storagePath, result.pendingStorage);
  assert.equal(restarted.projects, 4);
  assert.deepEqual(restarted.errors, []);
  console.log(
    `Desktop smoke passed: Electron ${result.electron}, startup ${result.startupMs} ms, ${result.projects} imported projects, no renderer errors.`,
  );
} finally {
  await rm(temp, {
    recursive: true,
    force: true,
    maxRetries: 10,
    retryDelay: 200,
  }).catch((error) => console.warn("Temporary profile retained:", error.code));
}
