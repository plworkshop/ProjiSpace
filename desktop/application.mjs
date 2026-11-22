import {
  app,
  BrowserWindow,
  dialog,
  Menu,
  nativeTheme,
  session,
  shell,
} from "electron";
import { randomBytes } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { existsSync, mkdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createApp } from "../server/app.mjs";
import { externalUrl, importWorkspace, readWindowState } from "./data.mjs";
import { translate } from "../src/translations.mjs";
import { microphoneOnly } from "./permissions.mjs";
import { createAssistantRuntime } from "./assistant-runtime.mjs";
import { openStorage } from "./storage.mjs";

const root = fileURLToPath(new URL("../", import.meta.url));
const appId = "app.sidequest.desktop";
const csp =
  "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self' data:; connect-src 'self'; object-src 'none'; frame-src 'none'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'";

export async function launchDesktop({
  profileDirectory,
  importDirectory,
  visible = true,
} = {}) {
  const started = performance.now();
  app.setName("ProjiSpace");
  if (process.platform === "win32") app.setAppUserModelId(appId);
  // Keep the existing profile, including projects and the downloaded speech model.
  const profilePath = profileDirectory || path.join(app.getPath("appData"), "Projector");
  mkdirSync(profilePath, { recursive: true });
  app.setPath("userData", profilePath);
  if (!app.requestSingleInstanceLock()) {
    app.quit();
    return null;
  }
  let window;
  app.on("second-instance", () => {
    if (!window || window.isDestroyed()) return;
    if (window.isMinimized()) window.restore();
    window.show();
    window.focus();
  });
  await app.whenReady();
  console.log("ProjiSpace desktop: Electron ready");
  Menu.setApplicationMenu(process.platform === "darwin"
    ? Menu.buildFromTemplate([{ role: "appMenu" }, { role: "editMenu" }, { role: "windowMenu" }])
    : null);
  nativeTheme.themeSource = "dark";
  const profile = app.getPath("userData");
  const storage = await openStorage(profile, async () => {
    const result = await dialog.showOpenDialog(window, {
      title: translate("Выберите пустую папку хранения", service.getLanguage()),
      properties: ["openDirectory", "createDirectory"],
    });
    return result.canceled ? null : result.filePaths[0];
  });
  const dataDirectory = storage.directory;
  const legacyData = path.join(app.getPath("appData"), "Sidequest", "data");
  const importSource =
    importDirectory ||
    (existsSync(path.join(legacyData, "sidequest.sqlite")) ? legacyData : null);
  const migration = importSource
    ? await importWorkspace(importSource, dataDirectory)
    : { imported: false };
  console.log("ProjiSpace desktop: workspace ready");
  await mkdir(profile, { recursive: true });
  const token = randomBytes(32).toString("hex");
  const service = await createApp({
    dataDir: dataDirectory,
    distDir: path.join(root, "dist"),
    seed: false,
    accessToken: token,
    storage,
    assistantRuntime: createAssistantRuntime({ directory: path.join(dataDirectory, "assistant-downloads") }),
    dictationExecutable: process.platform === "win32" ? path.join(
      app.isPackaged ? process.resourcesPath : path.join(root, "desktop"),
      "voice",
      "whisper-cli.exe",
    ) : null,
  });
  await new Promise((resolve, reject) => {
    service.server.once("error", reject);
    service.server.listen(0, "127.0.0.1", resolve);
  });
  const origin = `http://127.0.0.1:${service.server.address().port}`;
  console.log("ProjiSpace desktop: local service ready");
  const browserSession = session.defaultSession;
  browserSession.setPermissionRequestHandler(
    (contents, permission, callback, details) => {
      const requestingOrigin = (() => {
        try {
          return new URL(details.requestingUrl).origin;
        } catch {
          return "";
        }
      })();
      callback(
        !!window &&
          contents === window.webContents &&
          details.isMainFrame &&
          microphoneOnly(permission, requestingOrigin, details, origin),
      );
    },
  );
  browserSession.setPermissionCheckHandler(
    (contents, permission, requestingOrigin, details) =>
      !!window &&
      contents === window.webContents &&
      microphoneOnly(permission, requestingOrigin, details, origin),
  );
  browserSession.webRequest.onHeadersReceived((details, callback) =>
    callback({
      responseHeaders: {
        ...details.responseHeaders,
        "Content-Security-Policy": [csp],
      },
    }),
  );
  await browserSession.cookies.set({
    url: origin,
    name: "sidequest_session",
    value: token,
    httpOnly: true,
    sameSite: "strict",
  });
  console.log("ProjiSpace desktop: session ready");
  const state = await readWindowState(profile);
  window = new BrowserWindow({
    width: state.width,
    height: state.height,
    minWidth: 900,
    minHeight: 620,
    title: "ProjiSpace",
    backgroundColor: "#111215",
    show: false,
    autoHideMenuBar: true,
    icon: path.join(root, "desktop", "assets", "icon.png"),
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      webSecurity: true,
      spellcheck: true,
      devTools: !app.isPackaged,
    },
  });
  window.webContents.setWindowOpenHandler(({ url }) => {
    const safe = externalUrl(url);
    if (safe)
      shell
        .openExternal(safe)
        .catch((error) =>
          console.error("Не удалось открыть ссылку:", error.message),
        );
    return { action: "deny" };
  });
  window.webContents.on("will-navigate", (event, url) => {
    if (new URL(url).origin === origin) return;
    event.preventDefault();
    const safe = externalUrl(url);
    if (safe)
      shell
        .openExternal(safe)
        .catch((error) =>
          console.error("Не удалось открыть ссылку:", error.message),
        );
  });
  window.webContents.on("will-attach-webview", (event) =>
    event.preventDefault(),
  );
  window.webContents.on("will-prevent-unload", (event) => {
    const t = (message) => translate(message, service.getLanguage());
    const answer = dialog.showMessageBoxSync(window, {
      type: "question",
      title: t("Несохранённые изменения"),
      message: t("Закрыть ProjiSpace без сохранения изменений?"),
      buttons: [t("Остаться"), t("Закрыть без сохранения")],
      defaultId: 0,
      cancelId: 0,
      noLink: true,
    });
    if (answer === 1) event.preventDefault();
  });
  let windowStateSave = Promise.resolve();
  window.on("close", () => {
    const bounds = window.getNormalBounds();
    windowStateSave = writeFile(
      path.join(profile, "window.json"),
      JSON.stringify({
        width: bounds.width,
        height: bounds.height,
        maximized: window.isMaximized(),
      }),
    ).catch((error) =>
      console.error("Не удалось сохранить размер окна:", error.message),
    );
  });
  window.once("ready-to-show", () => {
    if (state.maximized) window.maximize();
    if (visible) window.show();
  });
  let closed = false;
  app.on("window-all-closed", () => app.quit());
  app.on("will-quit", (event) => {
    if (closed) return;
    event.preventDefault();
    closed = true;
    Promise.all([windowStateSave, service.close()]).finally(() => app.quit());
  });
  await window.loadURL(origin);
  console.log("ProjiSpace desktop: window loaded");
  if (storage.warning) {
    await dialog.showMessageBox(window, {
      type: "warning",
      title: "ProjiSpace",
      message: translate("Не удалось перенести хранилище. Используется прежняя папка.", service.getLanguage()),
      detail: translate(storage.warning, service.getLanguage()),
    });
  }
  return {
    window,
    service,
    origin,
    token,
    migration,
    profileDirectory: profile,
    startupMs: Math.round(performance.now() - started),
  };
}
