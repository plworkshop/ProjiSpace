import { useEffect, useState } from "react";
import { api } from "./api";
import { t } from "./i18n";

export function usePanelPreference(
  key: "projectsPanelCollapsed" | "planCollapsed",
  initial: boolean,
  refresh: () => Promise<void>,
  notify: (message: string) => void,
) {
  const [collapsed, setCollapsed] = useState(initial);
  const [busy, setBusy] = useState(false);
  useEffect(() => setCollapsed(initial), [initial]);
  async function toggle() {
    if (busy) return;
    setBusy(true);
    setCollapsed(!collapsed);
    try {
      await api.panelCollapsed(key, !collapsed);
      await refresh();
    } catch {
      setCollapsed(collapsed);
      notify(t("Не удалось сохранить настройку панели"));
    } finally {
      setBusy(false);
    }
  }
  return { collapsed, toggle, busy };
}
