import { DatabaseSync, backup } from "node:sqlite";
import {
  mkdir,
  mkdtemp,
  copyFile,
  readFile,
  rename,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import path from "node:path";

async function exists(file) {
  try {
    await stat(file);
    return true;
  } catch (error) {
    if (error.code === "ENOENT") return false;
    throw error;
  }
}

// Copy a SQLite snapshot, including committed WAL changes, without modifying the source.
export async function importWorkspace(sourceDirectory, dataDirectory) {
  if (await exists(path.join(dataDirectory, "sidequest.sqlite")))
    return { imported: false };
  const source = path.resolve(sourceDirectory);
  if (source === path.resolve(dataDirectory))
    throw new Error("Источник и папка приложения должны различаться.");
  const databaseFile = path.join(source, "sidequest.sqlite");
  if (!(await exists(databaseFile)))
    throw new Error("В выбранной папке нет базы sidequest.sqlite.");
  await mkdir(path.dirname(dataDirectory), { recursive: true });
  const stage = await mkdtemp(
    path.join(path.dirname(dataDirectory), ".sidequest-import-"),
  );
  try {
    const original = new DatabaseSync(databaseFile, { readOnly: true });
    try {
      await backup(original, path.join(stage, "sidequest.sqlite"));
    } finally {
      original.close();
    }
    const snapshot = new DatabaseSync(path.join(stage, "sidequest.sqlite"), {
      readOnly: true,
    });
    let images, projects;
    try {
      projects = snapshot
        .prepare("SELECT count(*) AS count FROM projects")
        .get().count;
      images = snapshot
        .prepare(
          "SELECT storedName FROM project_references WHERE storedName IS NOT NULL",
        )
        .all();
    } finally {
      snapshot.close();
    }
    await mkdir(path.join(stage, "files"));
    for (const { storedName } of images) {
      if (
        typeof storedName !== "string" ||
        !/^[a-f0-9-]+\.(png|jpg|webp|gif)$/.test(storedName)
      )
        throw new Error("В базе обнаружено некорректное имя изображения.");
      await copyFile(
        path.join(source, "files", storedName),
        path.join(stage, "files", storedName),
      );
    }
    await mkdir(path.join(stage, "backups"));
    await copyFile(
      path.join(stage, "sidequest.sqlite"),
      path.join(stage, "backups", "before-desktop-import.sqlite"),
    );
    const result = {
      imported: true,
      projects,
      images: images.length,
      importedAt: new Date().toISOString(),
    };
    await writeFile(
      path.join(stage, "import.json"),
      JSON.stringify(result, null, 2),
    );
    await rename(stage, dataDirectory);
    return result;
  } catch (error) {
    await rm(stage, { recursive: true, force: true });
    throw error;
  }
}

export async function readWindowState(profileDirectory) {
  try {
    const state = JSON.parse(
      await readFile(path.join(profileDirectory, "window.json"), "utf8"),
    );
    return {
      width: Math.max(900, Math.min(Number(state.width) || 1280, 2560)),
      height: Math.max(620, Math.min(Number(state.height) || 850, 1600)),
      maximized: state.maximized === true,
    };
  } catch (error) {
    if (error.code !== "ENOENT" && !(error instanceof SyntaxError)) throw error;
    return { width: 1280, height: 850, maximized: false };
  }
}

export function externalUrl(value) {
  try {
    const url = new URL(value);
    if (
      !["https:", "http:", "mailto:"].includes(url.protocol) ||
      url.username ||
      url.password
    )
      return null;
    return url.href;
  } catch {
    return null;
  }
}
