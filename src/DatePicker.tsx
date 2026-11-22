import { useEffect, useId, useRef, useState } from "react";
import {
  CalendarDays,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import {
  calendarDate,
  calendarGrid,
  calendarKey,
  shiftMonth,
  mondayFirst as localeMondayFirst,
} from "./calendar";
import { getLanguage, t } from "./i18n";
import "./DatePicker.css";

export default function DatePicker({
  value,
  onChange,
  label,
  disabled = false,
  monthLabel = false,
}: {
  value: string;
  onChange: (value: string) => void;
  label: string;
  disabled?: boolean;
  monthLabel?: boolean;
}) {
  const id = useId();
  const popup = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const [month, setMonth] = useState(value.slice(0, 7));
  const [monthsView, setMonthsView] = useState(false);
  const [focused, setFocused] = useState(value);
  const language = getLanguage();
  const mondayFirst = localeMondayFirst(language);
  const cells = calendarGrid(month, mondayFirst);
  const today = calendarKey(new Date());
  const monthText = new Intl.DateTimeFormat(language, {
    month: "long",
    year: "numeric",
  }).format(calendarDate(`${month}-01`));
  function close(restore = true) {
    popup.current?.hidePopover();
    if (restore) trigger.current?.focus({ preventScroll: true });
  }
  function select(date: string) {
    onChange(date);
    close();
  }
  function position() {
    const rect = trigger.current!.getBoundingClientRect();
    const width = Math.min(264, window.innerWidth - 24);
    const height = popup.current!.getBoundingClientRect().height || 296;
    const left = Math.max(
      12,
      Math.min(rect.left, window.innerWidth - width - 12),
    );
    const top =
      rect.bottom + 8 + height <= window.innerHeight - 12
        ? rect.bottom + 8
        : Math.max(12, rect.top - height - 8);
    Object.assign(popup.current!.style, {
      left: `${left}px`,
      top: `${top}px`,
      width: `${width}px`,
    });
  }
  useEffect(() => {
    if (!open) return;
    popup.current
      ?.querySelector<HTMLButtonElement>(`[data-picker-date="${value}"]`)
      ?.focus({ preventScroll: true });
    const dismiss = () => close(false);
    window.addEventListener("resize", dismiss);
    return () => window.removeEventListener("resize", dismiss);
  }, [open]);
  return (
    <div
      className={`project-date-picker ${monthLabel ? "date-picker-month" : ""}`}
      onKeyDown={(e) => {
        if (open && e.key === "Escape") {
          e.preventDefault();
          e.stopPropagation();
          close();
        }
      }}
    >
      <button
        ref={trigger}
        type="button"
        className="date-picker-trigger"
        aria-label={label}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={id}
        aria-description={new Intl.DateTimeFormat(language, {
          dateStyle: "full",
        }).format(calendarDate(value))}
        disabled={disabled}
        onClick={() => {
          if (open) {
            close();
            return;
          }
          setMonth(value.slice(0, 7));
          setFocused(value);
          setMonthsView(false);
          popup.current?.showPopover();
          position();
        }}
      >
        {!monthLabel && <CalendarDays size={13} />}
        <span>
          {new Intl.DateTimeFormat(
            language,
            monthLabel
              ? { month: "long", year: "numeric" }
              : { day: "2-digit", month: "2-digit", year: "numeric" },
          ).format(calendarDate(value))}
        </span>
        <ChevronDown size={11} />
      </button>
      <div
        id={id}
        ref={popup}
        popover="auto"
        role="dialog"
        aria-label={label}
        className="project-date-popup"
        onToggle={(e) =>
          setOpen((e.nativeEvent as ToggleEvent).newState === "open")
        }
        onBlurCapture={(e) => {
          if (
            e.relatedTarget &&
            !e.currentTarget.contains(e.relatedTarget as Node) &&
            e.relatedTarget !== trigger.current
          )
            close(false);
        }}
      >
        <div className="date-popup-heading">
          <button
            type="button"
            className="date-popup-month"
            aria-label={t("Выбрать месяц и год")}
            aria-expanded={monthsView}
            onClick={() => setMonthsView(!monthsView)}
          >
            {monthsView ? month.slice(0, 4) : monthText}
            <ChevronDown size={11} />
          </button>
          <button
            type="button"
            className="date-popup-arrow"
            aria-label={
              monthsView ? t("Предыдущий год") : t("Предыдущий месяц")
            }
            disabled={shiftMonth(month, monthsView ? -12 : -1) === month}
            onClick={() => setMonth(shiftMonth(month, monthsView ? -12 : -1))}
          >
            <ChevronLeft size={14} />
          </button>
          <button
            type="button"
            className="date-popup-arrow"
            aria-label={monthsView ? t("Следующий год") : t("Следующий месяц")}
            disabled={shiftMonth(month, monthsView ? 12 : 1) === month}
            onClick={() => setMonth(shiftMonth(month, monthsView ? 12 : 1))}
          >
            <ChevronRight size={14} />
          </button>
        </div>
        {monthsView ? (
          <div className="date-popup-months">
            {Array.from({ length: 12 }, (_, i) => {
              const key = `${month.slice(0, 4)}-${String(i + 1).padStart(2, "0")}`;
              return (
                <button
                  key={key}
                  type="button"
                  aria-pressed={month === key}
                  onClick={() => {
                    setMonth(key);
                    setMonthsView(false);
                    const date = value.startsWith(key) ? value : `${key}-01`;
                    setFocused(date);
                    requestAnimationFrame(() =>
                      popup.current
                        ?.querySelector<HTMLButtonElement>(
                          `[data-picker-date="${date}"]`,
                        )
                        ?.focus({ preventScroll: true }),
                    );
                  }}
                >
                  {new Intl.DateTimeFormat(language, { month: "short" }).format(
                    calendarDate(`${key}-01`),
                  )}
                </button>
              );
            })}
          </div>
        ) : (
          <>
            <div className="date-popup-weekdays" aria-hidden="true">
              {cells.slice(0, 7).map((date) => (
                <span key={date}>
                  {new Intl.DateTimeFormat(language, {
                    weekday: "short",
                  }).format(calendarDate(date))}
                </span>
              ))}
            </div>
            <div
              className="date-popup-grid"
              role="group"
              aria-label={t("Даты месяца")}
              onKeyDown={(e) => {
                if (
                  ![
                    "ArrowLeft",
                    "ArrowRight",
                    "ArrowUp",
                    "ArrowDown",
                    "Home",
                    "End",
                    "PageUp",
                    "PageDown",
                  ].includes(e.key)
                )
                  return;
                e.preventDefault();
                e.stopPropagation();
                const next = calendarDate(focused);
                if (e.key === "PageUp" || e.key === "PageDown") {
                  next.setDate(1);
                  next.setMonth(
                    next.getMonth() + (e.key === "PageUp" ? -1 : 1),
                  );
                } else if (e.key === "Home") next.setDate(1);
                else if (e.key === "End") next.setDate(monthDaysCount(month));
                else
                  next.setDate(
                    next.getDate() +
                      ({
                        ArrowLeft: -1,
                        ArrowRight: 1,
                        ArrowUp: -7,
                        ArrowDown: 7,
                      }[e.key] || 0),
                  );
                if (next.getFullYear() < 1 || next.getFullYear() > 9999) return;
                const key = calendarKey(next);
                setFocused(key);
                setMonth(key.slice(0, 7));
                requestAnimationFrame(() =>
                  popup.current
                    ?.querySelector<HTMLButtonElement>(
                      `[data-picker-date="${key}"]`,
                    )
                    ?.focus({ preventScroll: true }),
                );
              }}
            >
              {cells.map((date) => (
                <button
                  key={date}
                  type="button"
                  data-picker-date={date}
                  className={`${date.slice(0, 7) !== month ? "outside-month" : ""} ${date === today ? "is-today" : ""}`}
                  disabled={date.slice(0, 4) === "0000" || date.length !== 10}
                  aria-label={new Intl.DateTimeFormat(language, {
                    dateStyle: "full",
                  }).format(calendarDate(date))}
                  aria-pressed={date === value}
                  tabIndex={
                    date === focused ||
                    (!cells.includes(focused) && date === `${month}-01`)
                      ? 0
                      : -1
                  }
                  onFocus={() => setFocused(date)}
                  onClick={() => select(date)}
                >
                  {Number(date.slice(-2))}
                </button>
              ))}
            </div>
          </>
        )}
        <div className="date-popup-footer">
          <button type="button" onClick={() => select(today)}>
            {t("Сегодня")}
          </button>
          <button type="button" onClick={() => close()}>
            {t("Закрыть")}
          </button>
        </div>
      </div>
    </div>
  );
}
function monthDaysCount(month: string) {
  const last = calendarDate(`${month}-01`);
  last.setMonth(last.getMonth() + 1, 0);
  return last.getDate();
}
