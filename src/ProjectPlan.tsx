import { useEffect, useId, useState } from "react";
import { motion, useReducedMotion } from "motion/react";
import {
  CalendarDays,
  Check,
  Clock3,
  ChevronLeft,
  ChevronDown,
  ChevronRight,
  Flag,
  Pause,
  Play,
  Plus,
  StickyNote,
  Trash2,
  X,
} from "lucide-react";
import { api } from "./api";
import { getLanguage, t } from "./i18n";
import type { PlanningEntry, PlanningKind } from "./types";
import DatePicker from "./DatePicker";
import { deadlineSummary } from "./deadline";
import CalendarRail from "./CalendarRail";
import {
  calendarDate as asDate,
  calendarKey as dateKey,
  shiftMonth,
} from "./calendar";
import "./ProjectPlan.css";

const shortDate = (value: string) =>
  new Intl.DateTimeFormat(getLanguage(), {
    day: "numeric",
    month: "short",
  }).format(asDate(value));
type Draft = {
  id?: string;
  kind: PlanningKind;
  title: string;
  date: string;
  completed: boolean;
};

export default function ProjectPlan({
  projectId,
  entries,
  refresh,
  onDirtyChange,
  compact = false,
  collapsed,
  onToggle,
  collapseBusy,
}: {
  projectId: string;
  entries: PlanningEntry[];
  refresh: () => Promise<void>;
  onDirtyChange: (dirty: boolean) => void;
  compact?: boolean;
  collapsed: boolean;
  onToggle: () => void;
  collapseBusy: boolean;
}) {
  const bodyId = useId();
  const [today, setToday] = useState(() => dateKey(new Date()));
  useEffect(() => {
    const update = () => setToday(dateKey(new Date()));
    const timer = window.setInterval(update, 60000);
    document.addEventListener("visibilitychange", update);
    return () => { clearInterval(timer); document.removeEventListener("visibilitychange", update); };
  }, []);
  const [selected, setSelected] = useState(today);
  const [month, setMonth] = useState(today.slice(0, 7));
  const [draft, setDraft] = useState<Draft | null>(null);
  const [original, setOriginal] = useState<Draft | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [light, setLight] = useState(true);
  const reduced = useReducedMotion();
  const [calendarRequest, setCalendarRequest] = useState(0);
  const dirty =
    draft !== null && JSON.stringify(draft) !== JSON.stringify(original);
  const milestones = entries
    .filter((e) => e.kind !== "note")
    .sort((a, b) => a.date.localeCompare(b.date));
  const stages = milestones.filter((e) => e.kind === "milestone");
  const start = milestones.find((e) => e.kind === "start");
  const deadline = milestones.find((e) => e.kind === "deadline");
  const note = entries.find((e) => e.kind === "note" && e.date === selected);
  const selectedMilestones = milestones.filter((e) => e.date === selected);
  const nodes = [
    { kind: "start" as const, title: t("Старт"), entry: start },
    ...(stages.length
      ? stages.map((entry) => ({
          kind: "milestone" as const,
          title: entry.title,
          entry,
        }))
      : [
          {
            kind: "milestone" as const,
            title: t("Этап {number}", { number: 1 }),
            entry: undefined,
          },
        ]),
    { kind: "deadline" as const, title: t("Дедлайн"), entry: deadline },
  ];
  const currentEntryId = nodes.find(
    (node) => node.entry && !node.entry.completed,
  )?.entry?.id;
  useEffect(() => {
    onDirtyChange(dirty);
    return () => onDirtyChange(false);
  }, [dirty, onDirtyChange]);

  function canSwitch() {
    if (busy) return false;
    if (!dirty) {
      setError("");
      return true;
    }
    setError(t("Сначала сохраните или отмените изменения."));
    return false;
  }
  function open(kind: PlanningKind, entry?: PlanningEntry, date = selected) {
    if (!canSwitch()) return;
    const next: Draft = entry
      ? {
          id: entry.id,
          kind,
          title: entry.title,
          date: entry.date,
          completed: entry.completed,
        }
      : {
          kind,
          title:
            kind === "note"
              ? ""
              : kind === "start"
                ? t("Старт")
                : kind === "deadline"
                  ? t("Дедлайн")
                  : t("Этап {number}", { number: stages.length + 1 }),
          date,
          completed: false,
        };
    setDraft(next);
    setOriginal(next);
    setConfirmDelete(false);
  }
  function close() {
    if (!busy) {
      setDraft(null);
      setOriginal(null);
      setError("");
      setConfirmDelete(false);
    }
  }
  function choose(date: string) {
    if (!canSwitch()) return;
    close();
    setSelected(date);
    setCalendarRequest((value) => value + 1);
    setMonth(date.slice(0, 7));
  }
  function moveMonth(offset: number) {
    if (!canSwitch()) return;
    const next = shiftMonth(month, offset);
    if (next !== month) choose(`${next}-01`);
  }
  async function save() {
    if (!draft || busy) return;
    setBusy(true);
    setError("");
    try {
      const { id, ...values } = draft;
      if (id) {
        const { kind: _, ...updates } = values;
        await api.updatePlanning(id, updates);
      } else await api.createPlanning(projectId, values);
      await refresh();
      setSelected(values.date);
      setMonth(values.date.slice(0, 7));
      setDraft(null);
      setOriginal(null);
      setConfirmDelete(false);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function remove() {
    if (!draft?.id || busy) return;
    setBusy(true);
    setError("");
    try {
      await api.removePlanning(draft.id);
      await refresh();
      setDraft(null);
      setOriginal(null);
      setConfirmDelete(false);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  const controls =
    "plan-control motion-safe:transition-colors motion-safe:duration-200";
  return (
    <section
      className={`project-plan ${compact && !draft ? "plan-compact" : ""} ${collapsed ? "is-collapsed" : ""}`}
      aria-label={t("План проекта")}
      aria-busy={busy}
      onChangeCapture={() => setError("")}
    >
      <div className="plan-heading">
        <h2>
          <button
            type="button"
            className="plan-toggle"
            onClick={onToggle}
            disabled={collapseBusy}
            aria-expanded={!collapsed}
            aria-controls={bodyId}
            aria-label={collapsed ? t("Развернуть план") : t("Свернуть план")}
            title={t("План проекта")}
          >
            <CalendarDays size={15} />
            <span>{t("План проекта")}</span>
            <ChevronDown size={13} className="plan-collapse-chevron" />
          </button>
        </h2>
        <div className="plan-actions" inert={collapsed}>
          {!reduced && (
            <button
              type="button"
              className={controls}
              aria-label={
                light
                  ? t("Приостановить свет на линии")
                  : t("Включить свет на линии")
              }
              aria-pressed={!light}
              title={
                light
                  ? t("Приостановить свет на линии")
                  : t("Включить свет на линии")
              }
              onClick={() => setLight(!light)}
            >
              {light ? <Pause size={13} /> : <Play size={13} />}
            </button>
          )}
          <button
            type="button"
            className={`${controls} plan-add-stage`}
            aria-label={t("Добавить этап")}
            title={t("Добавить этап")}
            disabled={busy}
            onClick={() => open("milestone")}
          >
            <Plus size={14} />
            <span>{t("Этап")}</span>
          </button>
        </div>
      </div>
      <div id={bodyId} className="plan-collapse-body" inert={collapsed}>
        <div
          className="milestone-scroll"
          tabIndex={0}
          aria-label={t("Этапы проекта")}
        >
          <div className="milestone-track" data-light={light && !reduced}>
            <span className="milestone-line" aria-hidden="true">
              <span />
            </span>
            {nodes.map((node) => {
              const countdown = node.kind === "deadline" && node.entry
                ? deadlineSummary(node.entry.date, today, node.entry.completed, getLanguage())
                : null;
              const state = node.entry?.completed
                ? "complete"
                : !node.entry
                  ? "unset"
                  : node.entry.id === currentEntryId
                    ? "current"
                    : node.entry.date < today
                      ? "overdue"
                      : "scheduled";
              const status =
                state === "complete"
                  ? t("Завершён")
                  : state === "current"
                    ? `${t("Текущий этап")}${node.entry!.date < today ? ` · ${t("Срок прошёл")}` : ""}`
                    : state === "overdue"
                      ? t("Срок прошёл")
                      : state === "scheduled"
                        ? t("Запланирован")
                        : t("Указать дату");
              return (
                <button
                  key={node.entry?.id || node.kind}
                  type="button"
                  disabled={busy}
                  className="milestone-node motion-safe:transition-colors motion-safe:duration-200"
                  data-state={state}
                  aria-label={`${
                    node.entry
                      ? t("Изменить этап {name}", { name: node.entry.title })
                      : t("Настроить {name}", { name: node.title })
                  } · ${status}${countdown ? ` · ${countdown.label}` : ""}`}
                  title={
                    node.entry
                      ? `${node.entry.title} · ${shortDate(node.entry.date)} · ${status}`
                      : t("Указать дату")
                  }
                  onClick={() => open(node.kind, node.entry)}
                >
                  <span className="milestone-pill">
                    {state === "complete" ? (
                      <Check size={13} aria-hidden="true" />
                    ) : state === "current" ? (
                      <Play size={12} fill="currentColor" aria-hidden="true" />
                    ) : state === "overdue" ? (
                      <Clock3 size={13} aria-hidden="true" />
                    ) : node.kind === "deadline" ? (
                      <Flag size={12} aria-hidden="true" />
                    ) : (
                      <span className="milestone-dot" />
                    )}
                    <span>{node.entry?.title || node.title}</span>
                  </span>
                  <small className={countdown ? "deadline-date" : undefined}>
                    {node.entry
                      ? shortDate(node.entry.date)
                      : t("Указать дату")}
                    {countdown && <span className="deadline-count" data-tone={countdown.tone}>{countdown.label}</span>}
                  </small>
                </button>
              );
            })}
          </div>
        </div>
        <div className="plan-lower">
          {draft ? (
            <motion.form
              key="editor"
              className="plan-entry-form"
              initial={{ opacity: 0, y: reduced ? 0 : 5 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: reduced ? 0 : 0.16 }}
              onSubmit={(e) => {
                e.preventDefault();
                void save();
              }}
              onKeyDown={(e) => {
                if (e.key === "Escape") {
                  e.stopPropagation();
                  close();
                }
                if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
                  e.preventDefault();
                  void save();
                }
              }}
            >
              <div className="plan-editor-heading">
                <span>
                  {draft.kind === "note"
                    ? t("Заметка на {date}", { date: shortDate(draft.date) })
                    : draft.id
                      ? t("Изменить этап")
                      : t("Новый этап")}
                </span>
                <button
                  type="button"
                  className={controls}
                  disabled={busy}
                  onClick={close}
                  aria-label={t("Закрыть редактор плана")}
                >
                  <X size={14} />
                </button>
              </div>
              {draft.kind === "note" ? (
                <textarea
                  dir="auto"
                  autoFocus
                  value={draft.title}
                  maxLength={4000}
                  placeholder={t("Что важно в этот день?")}
                  aria-label={t("Текст заметки")}
                  disabled={busy}
                  onChange={(e) =>
                    setDraft({ ...draft, title: e.target.value })
                  }
                />
              ) : (
                <div className="plan-milestone-fields">
                  <input
                    dir="auto"
                    autoFocus
                    aria-label={t("Название этапа")}
                    value={draft.title}
                    maxLength={120}
                    required
                    disabled={busy}
                    onChange={(e) =>
                      setDraft({ ...draft, title: e.target.value })
                    }
                  />
                  <DatePicker
                    label={t("Дата этапа")}
                    value={draft.date}
                    disabled={busy}
                    onChange={(date) => setDraft({ ...draft, date })}
                  />
                </div>
              )}
              <div className="plan-editor-actions">
                {confirmDelete ? (
                  <>
                    <span className="plan-delete-question">
                      {t("Удалить запись?")}
                    </span>
                    <button
                      type="button"
                      className={controls}
                      onClick={() => setConfirmDelete(false)}
                      disabled={busy}
                    >
                      {t("Отмена")}
                    </button>
                    <button
                      type="button"
                      className={`${controls} plan-delete-confirm`}
                      disabled={busy}
                      onClick={() => void remove()}
                    >
                      {t("Удалить")}
                    </button>
                  </>
                ) : (
                  <>
                    {draft.id && (
                      <button
                        type="button"
                        className={`${controls} danger`}
                        title={t("Удалить запись")}
                        aria-label={t("Удалить запись")}
                        disabled={busy}
                        onClick={() => setConfirmDelete(true)}
                      >
                        <Trash2 size={13} />
                      </button>
                    )}
                    {draft.kind !== "note" && (
                      <label
                        className="plan-completed"
                        title={t("Этап завершён")}
                      >
                        <input
                          type="checkbox"
                          aria-label={t("Этап завершён")}
                          checked={draft.completed}
                          disabled={busy}
                          onChange={(e) =>
                            setDraft({ ...draft, completed: e.target.checked })
                          }
                        />
                        <span>{t("Завершён")}</span>
                      </label>
                    )}
                    <button
                      type="button"
                      className={`${controls} plan-cancel`}
                      onClick={close}
                      disabled={busy}
                    >
                      {t("Отмена")}
                    </button>
                    <button
                      type="submit"
                      className={`${controls} plan-save`}
                      disabled={busy || !draft.title.trim() || !draft.date}
                    >
                      {busy ? t("Сохраняем…") : t("Сохранить")}
                      <Check size={13} />
                    </button>
                  </>
                )}
              </div>
            </motion.form>
          ) : (
            <motion.div
              key="calendar"
              className="plan-calendar"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: reduced ? 0 : 0.14 }}
            >
              <div className="plan-calendar-heading">
                <DatePicker
                  label={t("Перейти к дате")}
                  value={selected}
                  onChange={choose}
                  monthLabel
                />
                <div>
                  <button
                    type="button"
                    className={controls}
                    onClick={() => choose(today)}
                  >
                    {t("Сегодня")}
                  </button>
                  <button
                    type="button"
                    className={controls}
                    onClick={() => moveMonth(-1)}
                    aria-label={t("Предыдущий месяц")}
                  >
                    <ChevronLeft size={14} />
                  </button>
                  <button
                    type="button"
                    className={controls}
                    onClick={() => moveMonth(1)}
                    aria-label={t("Следующий месяц")}
                  >
                    <ChevronRight size={14} />
                  </button>
                </div>
              </div>
              <CalendarRail
                month={month}
                selected={selected}
                entries={entries}
                onSelect={choose}
                revealKey={calendarRequest}
              />
              <button
                type="button"
                className="plan-note-preview motion-safe:transition-colors motion-safe:duration-200"
                onClick={() => open("note", note)}
                aria-label={
                  note
                    ? t("Изменить заметку на {date}", {
                        date: shortDate(selected),
                      })
                    : t("Добавить заметку на {date}", {
                        date: shortDate(selected),
                      })
                }
                title={
                  note?.title ||
                  selectedMilestones.map((e) => e.title).join(" · ")
                }
              >
                <StickyNote size={13} />
                <span>
                  <strong>{shortDate(selected)}</strong>
                  <span>
                    {note?.title ||
                      (selectedMilestones.length
                        ? selectedMilestones.map((e) => e.title).join(" · ")
                        : t("Добавить заметку"))}
                  </span>
                </span>
                {note ? <ChevronRight size={13} /> : <Plus size={13} />}
              </button>
            </motion.div>
          )}
        </div>
      </div>
      {error && (
        <p className="plan-error" role="alert">
          {error}
        </p>
      )}
    </section>
  );
}
