import { t } from "./i18n";
import { useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import { api } from "./api";

export default function ResizablePane({
  side,
  initialWidth,
  refresh,
  notify,
  children,
  collapsed = false,
}: {
  side: "projects" | "references";
  initialWidth: number | null;
  refresh: () => Promise<void>;
  notify: (message: string) => void;
  children: ReactNode;
  collapsed?: boolean;
}) {
  const projects = side === "projects";
  const min = projects ? 190 : 200;
  const max = projects ? 420 : 560;
  const variable = projects ? "--projects-preferred" : "--reference-width";
  const pane = useRef<HTMLDivElement>(null);
  const drag = useRef<{ id: number; edge: number; startWidth: number } | null>(
    null,
  );
  const [width, setWidth] = useState(initialWidth ?? (projects ? 245 : 265));
  const [resizing, setResizing] = useState(false);
  const currentWidth = useRef(width);
  useEffect(() => {
    const el = pane.current!;
    const observer = new ResizeObserver(() =>
      setWidth(Math.round(el.getBoundingClientRect().width)),
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  function update(next: number) {
    const grid = pane.current!.parentElement!;
    const gridStyle = getComputedStyle(grid);
    const opposite = grid.children[projects ? grid.children.length - 1 : 0];
    const available =
      grid.clientWidth -
      opposite.getBoundingClientRect().width -
      Number.parseFloat(gridStyle.columnGap) * 2 -
      Number.parseFloat(gridStyle.getPropertyValue("--main-min") || "330");
    const clamped = Math.round(Math.max(min, Math.min(max, available, next)));
    currentWidth.current = clamped;
    setWidth(clamped);
    grid.style.setProperty(variable, `${clamped}px`);
  }
  async function save() {
    try {
      await api.panelWidth(side, currentWidth.current);
      await refresh();
    } catch {
      notify(t("Не удалось запомнить ширину панели"));
    }
  }
  return (
    <div
      ref={pane}
      className={`${projects ? "projects-pane" : "reference-pane"} ${resizing ? "is-resizing" : ""} ${collapsed ? "is-collapsed" : ""}`}
    >
      <div
        className={`pane-resizer ${projects ? "projects-resizer" : "reference-resizer"}`}
        role="separator"
        hidden={collapsed}
        aria-label={
          projects ? t("Ширина панели проектов") : t("Ширина панели референсов")
        }
        aria-orientation="vertical"
        aria-valuemin={min}
        aria-valuemax={max}
        aria-valuenow={width}
        tabIndex={0}
        title={t("Потяните для изменения ширины · двойной щелчок — сброс")}
        onPointerDown={(event) => {
          if (event.button !== 0) return;
          event.preventDefault();
          event.currentTarget.focus();
          event.currentTarget.setPointerCapture(event.pointerId);
          const bounds = pane.current!.getBoundingClientRect();
          currentWidth.current = Math.round(bounds.width);
          drag.current = {
            id: event.pointerId,
            edge: projects ? bounds.left : bounds.right,
            startWidth: currentWidth.current,
          };
          setResizing(true);
        }}
        onPointerMove={(event) => {
          if (drag.current?.id === event.pointerId)
            update(
              projects
                ? event.clientX - drag.current.edge
                : drag.current.edge - event.clientX,
            );
        }}
        onPointerUp={(event) => {
          if (event.currentTarget.hasPointerCapture(event.pointerId))
            event.currentTarget.releasePointerCapture(event.pointerId);
        }}
        onLostPointerCapture={() => {
          const changed =
            drag.current && currentWidth.current !== drag.current.startWidth;
          drag.current = null;
          setResizing(false);
          if (changed) void save();
        }}
        onDoubleClick={() => {
          update(
            projects
              ? Number.parseFloat(
                  getComputedStyle(
                    pane.current!.parentElement!,
                  ).getPropertyValue("--projects-width"),
                )
              : 265,
          );
          void save();
        }}
        onKeyDown={(event) => {
          if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key))
            return;
          event.preventDefault();
          const direction =
            (event.key === "ArrowRight" ? 1 : -1) * (projects ? 1 : -1);
          update(
            event.key === "Home"
              ? min
              : event.key === "End"
                ? max
                : pane.current!.getBoundingClientRect().width + direction * 20,
          );
        }}
        onKeyUp={(event) => {
          if (["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key))
            void save();
        }}
      />
      {children}
    </div>
  );
}
