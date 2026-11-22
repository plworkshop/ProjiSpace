import { useEffect, useState } from "react";
import { FolderOpen, LoaderCircle } from "lucide-react";
import { api, type StorageStatus } from "./api";
import { t } from "./i18n";

export default function StorageSettings({ currentPath }: { currentPath: string }) {
  const [storage, setStorage] = useState<StorageStatus | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    api.storageStatus().then((value) => { if (active) setStorage(value); })
      .catch((failure: Error) => { if (active) setError(failure.message); });
    return () => { active = false; };
  }, []);
  async function change(cancel = false) {
    setBusy(true);
    setError("");
    try {
      setStorage(await (cancel ? api.cancelStorage() : api.chooseStorage()));
    } catch (failure) {
      setError((failure as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="storage-settings" aria-label={t("Хранилище")} aria-busy={busy}>
      <code className="storage-path" dir="ltr">{storage?.currentPath || currentPath}</code>
      {storage?.available && <>
        <button className="button small secondary storage-choose" disabled={busy} onClick={() => void change()}>
          {busy ? <LoaderCircle size={15} className="spin" /> : <FolderOpen size={15} />}
          {t("Изменить папку")}
        </button>
        {storage.pendingPath && <div className="storage-pending" role="status">
          <strong>{t("После перезапуска")}</strong>
          <code className="storage-path" dir="ltr">{storage.pendingPath}</code>
          <p>{t("Данные переместятся в новую папку при следующем запуске. Прежняя папка останется резервной копией.")}</p>
          <button className="button small secondary storage-cancel" disabled={busy} onClick={() => void change(true)}>{t("Отменить перенос")}</button>
        </div>}
      </>}
      {error && <p className="error" role="alert">{error}</p>}
    </section>
  );
}
