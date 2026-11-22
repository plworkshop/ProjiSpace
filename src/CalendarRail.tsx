import { useLayoutEffect, useMemo, useRef } from "react";
import { useReducedMotion } from "motion/react";
import { calendarDate, calendarKey, monthDays, mondayFirst } from "./calendar";
import { getLanguage, t } from "./i18n";
import {
  clampScroll,
  dragScroll,
  stepScroll,
  wheelDistance,
} from "./calendarScroll";
import type { PlanningEntry } from "./types";

export default function CalendarRail({
  month,
  selected,
  entries,
  onSelect,
  revealKey,
}: {
  month: string;
  selected: string;
  entries: PlanningEntry[];
  onSelect: (date: string) => void;
  revealKey: number;
}) {
  const rail = useRef<HTMLDivElement>(null);
  const overview = useRef<HTMLDivElement>(null);
  const slider = useRef<HTMLInputElement>(null);
  const output = useRef<HTMLOutputElement>(null);
  const frame = useRef(0);
  const previousMonth = useRef("");
  const drag = useRef<{
    pointer: number;
    x: number;
    left: number;
    scale: number;
  } | null>(null);
  const geometry = useRef({
    width: 1,
    viewport: 0,
    max: 0,
    step: 47,
    ruler: 0,
  });
  const visual = useRef({ left: NaN, range: "", value: -1 });
  const wheel = useRef({
    frame: 0,
    active: false,
    target: 0,
    position: 0,
    time: 0,
  });
  const reduced = useReducedMotion();
  const days = useMemo(() => monthDays(month), [month]);
  const today = calendarKey(new Date());
  const locale = getLanguage();
  const dates = useMemo(() => {
    const full = new Intl.DateTimeFormat(locale, { dateStyle: "full" });
    const short = new Intl.DateTimeFormat(locale, {
      day: "numeric",
      month: "short",
    });
    const weekday = new Intl.DateTimeFormat(locale, { weekday: "short" });
    const firstWeekday = mondayFirst(locale) ? 1 : 0;
    const offset = (calendarDate(days[0]).getDay() - firstWeekday + 7) % 7;
    return days.map((key, index) => {
      const date = calendarDate(key);
      const day = date.getDay();
      return {
        key,
        full: full.format(date),
        short: short.format(date),
        weekday: weekday.format(date),
        weekStart: day === firstWeekday,
        weekTone: Math.floor((index + offset) / 7) % 2,
        weekend: day === 0 || day === 6,
      };
    });
  }, [days, locale]);
  const { notes, milestones } = useMemo(() => {
    const notes = new Map<string, string>(),
      milestones = new Set<string>();
    for (const entry of entries) {
      if (entry.kind === "note") notes.set(entry.date, entry.title);
      else milestones.add(entry.date);
    }
    return { notes, milestones };
  }, [entries]);
  function updateOverview(position = rail.current?.scrollLeft ?? 0) {
    const el = rail.current;
    if (!el || !overview.current || !slider.current) return;
    const { width, max, viewport, step, ruler } = geometry.current;
    const left = clampScroll(position, max);
    if (left !== visual.current.left) {
      overview.current.style.setProperty(
        "--view-offset",
        `${(left / width) * ruler}px`,
      );
      visual.current.left = left;
    }
    const value = max ? Math.round((left / max) * 1000) : 0;
    if (value !== visual.current.value) {
      slider.current.value = String(value);
      visual.current.value = value;
    }
    const first = Math.min(days.length - 1, Math.floor(left / step));
    const last = Math.min(
      days.length - 1,
      Math.floor((left + viewport - 1) / step),
    );
    const range = `${first}:${last}`;
    if (range !== visual.current.range) {
      const text = `${dates[first].short} — ${dates[last].short}`;
      slider.current.setAttribute("aria-valuetext", text);
      if (output.current) output.current.textContent = text;
      visual.current.range = range;
    }
  }
  function queueOverview() {
    if (frame.current || wheel.current.active) return;
    frame.current = requestAnimationFrame(() => {
      frame.current = 0;
      updateOverview();
    });
  }
  function stopWheel() {
    cancelAnimationFrame(wheel.current.frame);
    wheel.current.active = false;
    wheel.current.frame = 0;
  }
  useLayoutEffect(() => {
    stopWheel();
    const el = rail.current!;
    const target = el.querySelector<HTMLElement>(`[data-date="${selected}"]`);
    if (target) {
      const fresh = previousMonth.current !== month;
      const left = target.offsetLeft;
      const right = left + target.offsetWidth;
      const outside =
        left < el.scrollLeft + 4 || right > el.scrollLeft + el.clientWidth - 4;
      if (fresh || outside)
        el.scrollTo({
          left: fresh
            ? left - (el.clientWidth - target.offsetWidth) / 2
            : left < el.scrollLeft
              ? left - 4
              : right - el.clientWidth + 4,
          behavior: fresh || reduced ? "instant" : "smooth",
        });
    }
    previousMonth.current = month;
    queueOverview();
  }, [month, selected, revealKey, reduced]);
  useLayoutEffect(() => {
    function measureGeometry() {
      const el = rail.current!;
      if (!el.clientWidth) return;
      stopWheel();
      drag.current = null;
      const cell = el.children[0] as HTMLElement;
      geometry.current = {
        width: el.scrollWidth,
        viewport: el.clientWidth,
        max: Math.max(0, el.scrollWidth - el.clientWidth),
        step: cell.getBoundingClientRect().width + 3,
        ruler: overview.current!.clientWidth,
      };
      overview.current!.style.setProperty(
        "--view-width",
        `${Math.min(100, (el.clientWidth / el.scrollWidth) * 100)}%`,
      );
      slider.current!.disabled = geometry.current.max < 1;
      visual.current.left = NaN;
      visual.current.range = "";
      updateOverview();
    }
    const observer = new ResizeObserver(measureGeometry);
    observer.observe(rail.current!);
    measureGeometry();
    return () => {
      observer.disconnect();
      cancelAnimationFrame(frame.current);
      frame.current = 0;
    };
  }, [month, locale]);
  useLayoutEffect(() => {
    const el = rail.current!;
    const ruler = overview.current!;
    function tick(now: number) {
      const motion = wheel.current;
      if (!motion.active) return;
      const next = stepScroll(
        motion.position,
        motion.target,
        Math.min(32, now - motion.time),
      );
      motion.position = next;
      motion.time = now;
      el.scrollLeft = next;
      updateOverview(next);
      if (next === motion.target) {
        motion.active = false;
        motion.frame = 0;
      } else motion.frame = requestAnimationFrame(tick);
    }
    function scroll(event: WheelEvent) {
      if (drag.current) {
        event.preventDefault();
        return;
      }
      if (
        event.ctrlKey ||
        !event.deltaY ||
        Math.abs(event.deltaX) > Math.abs(event.deltaY)
      ) {
        stopWheel();
        return;
      }
      const { max, viewport } = geometry.current;
      if (!max) return;
      const motion = wheel.current;
      const current = motion.active ? motion.target : el.scrollLeft;
      const target = clampScroll(
        current + wheelDistance(event.deltaY, event.deltaMode, viewport),
        max,
      );
      if (target === current && !motion.active) return;
      event.preventDefault();
      if (reduced) {
        el.scrollTo({ left: target, behavior: "instant" });
        updateOverview();
        return;
      }
      motion.target = target;
      if (motion.active) return;
      // Cancel a keyboard-initiated native scroll before direct wheel control.
      el.scrollTo({ left: el.scrollLeft, behavior: "instant" });
      motion.position = el.scrollLeft;
      cancelAnimationFrame(frame.current);
      frame.current = 0;
      motion.active = true;
      motion.time = performance.now();
      motion.frame = requestAnimationFrame(tick);
    }
    el.addEventListener("wheel", scroll, { passive: false });
    ruler.addEventListener("wheel", scroll, { passive: false });
    return () => {
      stopWheel();
      el.removeEventListener("wheel", scroll);
      ruler.removeEventListener("wheel", scroll);
    };
  }, [month, locale, reduced]);
  return (
    <>
      <div
        className="plan-days"
        ref={rail}
        role="group"
        aria-label={t("Календарь проекта")}
        onScroll={queueOverview}
        onPointerDown={stopWheel}
        onKeyDown={(e) => {
          if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(e.key))
            return;
          e.preventDefault();
          const date = calendarDate(selected);
          if (e.key === "Home") date.setDate(1);
          else if (e.key === "End") date.setDate(days.length);
          else date.setDate(date.getDate() + (e.key === "ArrowRight" ? 1 : -1));
          if (date.getFullYear() < 1 || date.getFullYear() > 9999) return;
          const key = calendarKey(date);
          onSelect(key);
          requestAnimationFrame(() =>
            rail.current
              ?.querySelector<HTMLButtonElement>(`[data-date="${key}"]`)
              ?.focus({ preventScroll: true }),
          );
        }}
      >
        {dates.map(
          ({ key: date, full, weekday, weekStart, weekTone, weekend }) => (
            <button
              type="button"
              key={date}
              data-date={date}
              className={`plan-day ${date === today ? "is-today" : ""} ${notes.has(date) ? "has-note" : ""} ${weekStart ? "week-start" : ""} ${weekend ? "is-weekend" : ""}`}
              data-week-tone={weekTone}
              title={notes.get(date)}
              aria-label={[
                full,
                weekStart ? t("Начало недели") : "",
                notes.has(date) ? t("Есть заметка") : "",
                milestones.has(date) ? t("Есть этап") : "",
              ]
                .filter(Boolean)
                .join(" · ")}
              aria-pressed={date === selected}
              aria-current={date === today ? "date" : undefined}
              tabIndex={date === selected ? 0 : -1}
              onClick={() => onSelect(date)}
            >
              {notes.has(date) && (
                <span className="note-date-label" aria-hidden="true">
                  {t("Заметка")}
                </span>
              )}
              <small>{weekday}</small>
              <strong>{Number(date.slice(-2))}</strong>
              <span className="plan-day-marks">
                {milestones.has(date) && !notes.has(date) ? (
                  <i className="mark-milestone" />
                ) : null}
              </span>
            </button>
          ),
        )}
      </div>
      <div className="plan-ruler" ref={overview} onPointerDown={stopWheel}>
        <div className="plan-ruler-ticks" aria-hidden="true">
          {dates.map(({ key: date, weekStart }, i) => (
            <span
              key={date}
              className={`${i === 0 || weekStart ? "major-tick" : ""} ${weekStart ? "week-tick" : ""} ${notes.has(date) ? "note-tick" : ""} ${selected === date ? "selected-tick" : ""}`}
            />
          ))}
        </div>
        <span className="plan-ruler-window" aria-hidden="true" />
        <input
          ref={slider}
          type="range"
          min={0}
          max={1000}
          step={1}
          defaultValue={0}
          aria-label={t("Прокрутка календаря")}
          onPointerDown={(event) => {
            if (event.button !== 0 || !geometry.current.max) return;
            event.preventDefault();
            stopWheel();
            const el = rail.current!;
            el.scrollTo({ left: el.scrollLeft, behavior: "instant" });
            event.currentTarget.focus({ preventScroll: true });
            event.currentTarget.setPointerCapture(event.pointerId);
            drag.current = {
              pointer: event.pointerId,
              x: event.clientX,
              left: el.scrollLeft,
              scale: geometry.current.width / geometry.current.ruler,
            };
          }}
          onPointerMove={(event) => {
            const start = drag.current;
            if (!start || start.pointer !== event.pointerId) return;
            rail.current!.scrollLeft = dragScroll(
              start.left,
              event.clientX - start.x,
              start.scale,
              geometry.current.max,
            );
            queueOverview();
          }}
          onPointerUp={(event) => {
            if (event.currentTarget.hasPointerCapture(event.pointerId))
              event.currentTarget.releasePointerCapture(event.pointerId);
          }}
          onPointerCancel={() => {
            drag.current = null;
          }}
          onLostPointerCapture={() => {
            drag.current = null;
          }}
          onChange={(e) => {
            if (drag.current) return;
            stopWheel();
            const el = rail.current!;
            el.scrollTo({
              left:
                (Number(e.currentTarget.value) / 1000) * geometry.current.max,
              behavior: "instant",
            });
            queueOverview();
          }}
        />
        <output className="plan-range-output" ref={output} aria-hidden="true" />
      </div>
    </>
  );
}
