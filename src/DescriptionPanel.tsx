import { useLayoutEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import { FolderOpen, Maximize2, Minimize2 } from "lucide-react";
import { t } from "./i18n";
import "./DescriptionPanel.css";

export default function DescriptionPanel({
  actions,
  children,
}: {
  actions: ReactNode;
  children: ReactNode;
}) {
  const slot = useRef<HTMLDivElement>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  const toggleButton = useRef<HTMLButtonElement>(null);
  const animation = useRef<Animation | null>(null);
  const expandedRef = useRef(false);
  const backdropDown = useRef(false);
  const [expanded, setExpanded] = useState(false);

  useLayoutEffect(() => {
    const el = dialog.current!;
    el.open = true;
    return () => {
      animation.current?.cancel();
      el.close();
    };
  }, []);

  function toggle() {
    const el = dialog.current!;
    const from = el.getBoundingClientRect();
    const fromStyle = getComputedStyle(el);
    const fromShadow = fromStyle.boxShadow;
    const fromBackground = fromStyle.backgroundColor;
    const fromFilter = fromStyle.backdropFilter;
    animation.current?.cancel();
    const next = !expandedRef.current;
    expandedRef.current = next;
    setExpanded(next);
    let to: DOMRect;
    if (next) {
      el.dataset.expanded = "true";
      delete el.dataset.closing;
      if (!el.matches(":modal")) {
        el.close();
        el.showModal();
      }
      to = el.getBoundingClientRect();
      toggleButton.current?.focus({ preventScroll: true });
    } else {
      el.dataset.closing = "true";
      to = slot.current!.getBoundingClientRect();
    }
    const frame = (rect: DOMRect) => ({
      top: `${rect.top}px`,
      left: `${rect.left}px`,
      width: `${rect.width}px`,
      height: `${rect.height}px`,
    });
    const current = el.animate(
      [
        {
          ...frame(from),
          boxShadow: fromShadow,
          backgroundColor: fromBackground,
          backdropFilter: fromFilter,
        },
        {
          ...frame(to),
          boxShadow: next
            ? getComputedStyle(el).boxShadow
            : "0 24px 100px #0000",
          backgroundColor: getComputedStyle(next ? el : slot.current!)
            .backgroundColor,
          backdropFilter: next
            ? getComputedStyle(el).backdropFilter
            : "blur(0px) saturate(1)",
        },
      ],
      {
        duration: matchMedia("(prefers-reduced-motion: reduce)").matches
          ? 0
          : 380,
        easing: "cubic-bezier(0.22, 1, 0.36, 1)",
        fill: "both",
      },
    );
    animation.current = current;
    void current.finished
      .then(() => {
        if (animation.current !== current) return;
        animation.current = null;
        if (!next) {
          el.close();
          delete el.dataset.expanded;
          delete el.dataset.closing;
          el.open = true;
          toggleButton.current?.focus({ preventScroll: true });
        }
        current.cancel();
      })
      .catch(() => {});
  }

  return (
    <div className="description-box description-slot" ref={slot}>
      <dialog
        ref={dialog}
        className="description-surface"
        aria-label={t("Описание проекта")}
        onCancel={(event) => {
          event.preventDefault();
          if (expandedRef.current) toggle();
        }}
        onPointerDown={(event) => {
          const rect = event.currentTarget.getBoundingClientRect();
          backdropDown.current =
            event.target === event.currentTarget &&
            (event.clientX < rect.left ||
              event.clientX > rect.right ||
              event.clientY < rect.top ||
              event.clientY > rect.bottom);
        }}
        onClick={(event) => {
          if (
            backdropDown.current &&
            event.target === event.currentTarget &&
            expandedRef.current
          )
            toggle();
          backdropDown.current = false;
        }}
      >
        <div className="description-toolbar">
          <h2>
            <FolderOpen size={18} /> {t("О проекте")}
          </h2>
          <div className="description-toolbar-actions">
            {actions}
            <button
              ref={toggleButton}
              type="button"
              className="icon-button description-expand"
              aria-label={t(
                expanded ? "Свернуть описание" : "Развернуть описание",
              )}
              title={t(expanded ? "Свернуть описание" : "Развернуть описание")}
              aria-expanded={expanded}
              onClick={toggle}
            >
              {expanded ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
            </button>
          </div>
        </div>
        {children}
      </dialog>
    </div>
  );
}
