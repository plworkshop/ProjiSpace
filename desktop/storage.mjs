import { DatabaseSync, backup } from "node:sqlite";
import { cp, mkdir, mkdtemp, readFile, readdir, realpath, rename, rm, rmdir, stat, writeFile } from "node:fs/promises";
import path from "node:path";

function invalid(message) {
  throw Object.assign(new Error(message), { status: 400 });
}

function contains(parent, child) {
  const relative = path.relative(parent.toLowerCase(), child.toLowerCase());
  return relative === "" || (!relative.startsWith(`..${path.sep}`) && relative !== ".." && !path.isAbsolute(relative));
}

async function emptyDestination(source, destination) {
  const current = await realpath(source);
  const target = await realpath(destination);
  if (contains(current, target) || contains(target, current))
    invalid("Выберите отдельную пустую папку вне текущего хранилища.");
  if ((await readdir(target)).length)
    invalid("Выберите пустую папку. Существующие файлы не будут перезаписаны.");
  return target;
}

// Runs before the local service starts, so no renderer, clipper or model download can write during the copy.
async function copyWorkspace(source, destination) {
  const target = await emptyDestination(source, destination);
  const stage = await mkdtemp(path.join(path.dirname(target), ".projispace-storage-"));
  try {
    for (const name of await readdir(source)) {
      if (["sidequest.sqlite", "sidequest.sqlite-wal", "sidequest.sqlite-shm"].includes(name)) continue;
      await cp(path.join(source, name), path.join(stage, name), { recursive: true, errorOnExist: true, force: false });
    }
    const original = new DatabaseSync(path.join(source, "sidequest.sqlite"), { readOnly: true });
    try {
      await backup(original, path.join(stage, "sidequest.sqlite"));
    } finally {
      original.close();
    }
    const snapshot = new DatabaseSync(path.join(stage, "sidequest.sqlite"), { readOnly: true });
    try {
      if (snapshot.prepare("PRAGMA quick_check").get().quick_check !== "ok")
        throw new Error("Не удалось проверить копию базы данных.");
      for (const { storedName } of snapshot.prepare("SELECT storedName FROM project_references WHERE storedName IS NOT NULL").all()) {
        if (typeof storedName !== "string" || !/^[a-f0-9-]+\.(png|jpg|webp|gif)$/.test(storedName))
          throw new Error("В базе обнаружено некорректное имя изображения.");
        if (!(await stat(path.join(stage, "files", storedName))).isFile())
          throw new Error("Не удалось проверить копию изображения.");
      }
    } finally {
      snapshot.close();
    }
    await emptyDestination(source, target);
    // Non-recursive: fails rather than deleting anything added to the destination meanwhile.
    await rmdir(target);
    await rename(stage, target);
    return target;
  } finally {
    await rm(stage, { recursive: true, force: true });
  }
}

export async function openStorage(profileDirectory, chooseDirectory) {
  const configFile = path.join(profileDirectory, "storage-location.json");
  let config = { directory: path.join(profileDirectory, "data"), pendingPath: null };
  try {
    const saved = JSON.parse(await readFile(configFile, "utf8"));
    if (typeof saved.directory !== "string" || !path.isAbsolute(saved.directory) ||
        (saved.pendingPath !== null && (typeof saved.pendingPath !== "string" || !path.isAbsolute(saved.pendingPath))))
      throw new Error("Некорректные настройки папки хранения.");
    config = saved;
    // Never create a new empty database when a configured drive or folder is unavailable.
    try {
      if (!(await stat(path.join(config.directory, "sidequest.sqlite"))).isFile()) throw new Error();
    } catch {
      throw new Error("Папка хранения недоступна. Подключите диск и запустите ProjiSpace снова.");
    }
  } catch (error) {
    if (error.code !== "ENOENT" || error.path !== configFile) throw error;
  }
  const save = async (next) => {
    await mkdir(profileDirectory, { recursive: true });
    await writeFile(`${configFile}.tmp`, JSON.stringify(next, null, 2));
    await rename(`${configFile}.tmp`, configFile);
    config = next;
  };
  let warning = null;
  if (config.pendingPath) {
    try {
      const directory = await copyWorkspace(config.directory, config.pendingPath);
      await save({ directory, pendingPath: null });
    } catch (error) {
      warning = error.message;
      await save({ directory: config.directory, pendingPath: null });
    }
  }
  let busy = false;
  const status = () => ({ available: true, currentPath: config.directory, pendingPath: config.pendingPath });
  return {
    directory: config.directory,
    warning,
    status,
    async choose() {
      if (busy) invalid("Выбор папки уже открыт.");
      busy = true;
      try {
        const selected = await chooseDirectory();
        if (selected) {
          const pendingPath = await emptyDestination(config.directory, selected);
          await save({ directory: config.directory, pendingPath });
        }
        return status();
      } finally {
        busy = false;
      }
    },
    async cancel() {
      if (busy) invalid("Выбор папки уже открыт.");
      busy = true;
      try {
        await save({ directory: config.directory, pendingPath: null });
        return status();
      } finally {
        busy = false;
      }
    },
  };
}
