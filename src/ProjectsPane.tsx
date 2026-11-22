import { useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import { PanelLeftClose, PanelLeftOpen, Sparkles } from "lucide-react";
import { t } from "./i18n";
import type { Workspace } from "./types";
import ResizablePane from "./ResizablePane";
import { usePanelPreference } from "./usePanelPreference";

export default function ProjectsPane({
  data,
  refresh,
  notify,
  picker,
  mobileVisible = false,
  children,
}: {
  data: Workspace;
  refresh: () => Promise<void>;
  notify: (message: string) => void;
  picker: () => void;
  mobileVisible?: boolean;
  children: ReactNode;
}) {
  const preference = usePanelPreference(
    "projectsPanelCollapsed",
    data.projectsPanelCollapsed,
    refresh,
    notify,
  );
  const [desktop, setDesktop] = useState(
    () => matchMedia("(min-width: 801px)").matches,
  );
  useEffect(() => {
    const media = matchMedia("(min-width: 801px)");
    const change = () => setDesktop(media.matches);
    media.addEventListener("change", change);
    return () => media.removeEventListener("change", change);
  }, []);
  const collapsed = preference.collapsed && desktop;
  const previous = useRef(collapsed);
  const expand = useRef<HTMLButtonElement>(null);
  const collapse = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (preference.busy) return;
    if (desktop && previous.current !== collapsed)
      (collapsed ? expand : collapse).current?.focus({ preventScroll: true });
    previous.current = collapsed;
  }, [collapsed, desktop, preference.busy]);
  const pickerButton = (
    <button
      type="button"
      className="icon-button"
      title={t("Выбор проекта")}
      aria-label={t("Выбор проекта")}
      onClick={picker}
    >
      <Sparkles size={17} />
    </button>
  );
  return (
    <ResizablePane
      side="projects"
      initialWidth={data.projectsPanelWidth}
      refresh={refresh}
      notify={notify}
      collapsed={collapsed}
    >
      <div className="projects-panel-viewport" inert={collapsed}>
        <aside
          className={`projects-panel panel ${mobileVisible ? "mobile-visible" : ""}`}
          aria-label={t("Проекты")}
        >
          <div className="panel-heading">
            <h2>{t("Проекты")}</h2>
            <div className="projects-heading-actions">
              {pickerButton}
              <button
                ref={collapse}
                type="button"
                className="icon-button projects-collapse"
                title={t("Свернуть панель проектов")}
                aria-label={t("Свернуть панель проектов")}
                aria-expanded={!collapsed}
                disabled={preference.busy}
                onClick={() => void preference.toggle()}
              >
                <PanelLeftClose size={17} />
              </button>
            </div>
          </div>
          {children}
        </aside>
      </div>
      <nav
        className="projects-collapsed-tools"
        aria-label={t("Навигация студии")}
        inert={!collapsed}
      >
        <button
          ref={expand}
          type="button"
          className="icon-button"
          title={t("Развернуть панель проектов")}
          aria-label={t("Развернуть панель проектов")}
          aria-expanded={!collapsed}
          disabled={preference.busy}
          onClick={() => void preference.toggle()}
        >
          <PanelLeftOpen size={19} />
        </button>
        {pickerButton}
      </nav>
    </ResizablePane>
  );
}
