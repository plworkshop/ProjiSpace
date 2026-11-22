import { app, dialog } from "electron";
import { launchDesktop } from "./application.mjs";
import { DatabaseSync } from "node:sqlite";
import path from "node:path";
import { translate } from "../src/translations.mjs";

const importDirectory = process.argv
  .find((value) => value.startsWith("--import-from="))
  ?.slice("--import-from=".length);
launchDesktop({ importDirectory }).catch((error) => {
  let language = "ru";
  try {
    const db = new DatabaseSync(
      path.join(app.getPath("userData"), "data", "sidequest.sqlite"),
      { readOnly: true },
    );
    try {
      language =
        db.prepare("SELECT value FROM metadata WHERE key = 'language'").get()
          ?.value === "en"
          ? "en"
          : "ru";
    } finally {
      db.close();
    }
  } catch {
    /* A failed first launch may not have a database yet. */
  }
  dialog.showErrorBox(
    translate("Не удалось запустить ProjiSpace", language),
    translate(error.message, language),
  );
  app.quit();
});
