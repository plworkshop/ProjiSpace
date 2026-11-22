import { t, getLanguage } from "./i18n";
import {
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { sanitizeDescription } from "./description";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import type { CSSProperties, DragEvent, ReactNode } from "react";
import { api } from "./api";
import { FolderObject } from "./Art";
import { IconButton, Modal, LinkForm } from "./ui";
import ImageViewer from "./ImageViewer";
import ResizablePane from "./ResizablePane";
import ProjectPlan from "./ProjectPlan";
import DescriptionPanel from "./DescriptionPanel";
import "./ReferenceClip.css";
import ProjectsPane from "./ProjectsPane";
import { usePanelPreference } from "./usePanelPreference";
import type { Project, ProjectStatus, Reference, Workspace } from "./types";
import {
  ArrowUpRight,
  Check,
  CircleCheck,
  CircleDashed,
  CirclePause,
  CirclePlay,
  ChevronDown,
  ChevronRight,
  Edit3,
  Folder,
  FileText,
  ImagePlus,
  Layers3,
  Link2,
  ListTree,
  LoaderCircle,
  Menu,
  Plus,
  Pin,
  Search,
  Trash2,
  Upload,
  X,
} from "lucide-react";
const RichTextEditor = lazy(() => import("./RichTextEditor"));
const projectStatuses: { value: ProjectStatus; label: string; hint: string }[] =
  [
    { value: "planned", label: "Запланирован", hint: "Ещё не начали" },
    {
      value: "in_progress",
      label: "В работе",
      hint: "Сейчас занимаетесь проектом",
    },
    { value: "paused", label: "На паузе", hint: "Временно отложен" },
    { value: "completed", label: "Завершён", hint: "Работа закончена" },
  ];
const statusIcons = { planned: CircleDashed, in_progress: CirclePlay, paused: CirclePause, completed: CircleCheck };
function PinButton({
  project,
  busy,
  toggle,
}: {
  project: Project;
  busy: boolean;
  toggle: (project: Project) => void;
}) {
  const label = t("{v0} проект {v1}", {
    v0: project.pinned ? t("Открепить") : t("Закрепить"),
    v1: project.name,
  });
  return (
    <button
      type="button"
      className="project-pin"
      title={label}
      aria-label={label}
      aria-pressed={project.pinned}
      disabled={busy}
      onClick={() => toggle(project)}
    >
      <Pin
        size={14}
        fill={project.pinned ? "currentColor" : "none"}
        aria-hidden="true"
      />
    </button>
  );
}
function Tree({
  projects,
  selected,
  select,
  addSub,
  query,
  togglePin,
  pinBusy,
  refresh,
  notify,
  collapsedProjects,
  toggleProjectBranch,
}: {
  projects: Project[];
  selected: string;
  select: (id: string) => void;
  addSub: (p: Project) => void;
  query: string;
  togglePin: (project: Project) => void;
  pinBusy: boolean;
  refresh: () => Promise<void>;
  notify: (message: string) => void;
  collapsedProjects: Set<string>;
  toggleProjectBranch: (id: string) => void;
}) {
  const [preview, setPreview] = useState<Project[] | null>(null);
  const [savingOrder, setSavingOrder] = useState(false);
  const dragging = useRef<Project | null>(null);
  const [drop, setDrop] = useState<{ id: string; after: boolean } | null>(null);
  const reduced = useReducedMotion();
  const ordered = preview ?? projects;
  async function move(source: Project, target: Project, after: boolean) {
    if (savingOrder || source.id === target.id || source.parentId !== target.parentId) return;
    const siblings = ordered.filter(p => p.parentId === source.parentId);
    const next = siblings.filter(p => p.id !== source.id);
    next.splice(next.findIndex(p => p.id === target.id) + Number(after), 0, source);
    if (next.every((p, i) => p.id === siblings[i].id)) return;
    setPreview([...next, ...ordered.filter(p => p.parentId !== source.parentId)]);
    setSavingOrder(true);
    try {
      await api.reorderProjects(next.map(p => p.id));
      await refresh();
    } catch (error) {
      notify((error as Error).message);
    } finally {
      setPreview(null);
      setSavingOrder(false);
    }
  }
  function trackDrop(event: DragEvent<HTMLDivElement>, target: Project) {
    const source = dragging.current;
    if (!source || query || savingOrder) return;
    if (source.parentId !== target.parentId) { setDrop(null); return; }
    event.preventDefault(); event.stopPropagation();
    event.dataTransfer.dropEffect = "move";
    if (source.id === target.id) { setDrop(null); return; }
    const rect = event.currentTarget.getBoundingClientRect();
    const after = event.clientY > rect.top + rect.height / 2;
    setDrop(previous => previous?.id === target.id && previous.after === after ? previous : { id: target.id, after });
  }
  function matches(p: Project): boolean {
    return (
      p.name.toLowerCase().includes(query.toLowerCase()) ||
      projects.filter((c) => c.parentId === p.id).some(matches)
    );
  }
  function branch(parentId: string | null, depth = 0): ReactNode {
    return ordered
      .filter((p) => p.parentId === parentId && (!query || matches(p)))
      .map((p) => {
        const children = projects.filter((c) => c.parentId === p.id);
        const expanded = query ? true : !collapsedProjects.has(p.id);
        return (
          <motion.div key={p.id} layout={reduced || query ? false : "position"}
            transition={{ type: "spring", stiffness: 500, damping: 40 }}
            className="project-branch" data-drop={drop?.id === p.id ? (drop.after ? "after" : "before") : undefined}>
            <div
              className={`tree-row ${selected === p.id ? "active" : ""}`}
              style={{ "--depth": depth } as CSSProperties}
              onDragEnter={event => trackDrop(event, p)}
              onDragOver={event => trackDrop(event, p)}
              onDrop={(event) => {
                event.preventDefault(); event.stopPropagation();
                const source = dragging.current;
                const rect = event.currentTarget.getBoundingClientRect();
                dragging.current = null; setDrop(null);
                if (source) void move(source, p, event.clientY > rect.top + rect.height / 2);
              }}
            >
              <span className="tree-hover-highlight" aria-hidden="true" />
              {children.length > 0 && (
                <button
                  className="tree-expand"
                  aria-label={`${expanded ? t("Свернуть") : t("Развернуть")} ${p.name}`}
                  aria-expanded={expanded}
                  onClick={() => toggleProjectBranch(p.id)}
                >
                  {expanded ? (
                    <ChevronDown size={14} />
                  ) : (
                    <ChevronRight size={14} />
                  )}
                </button>
              )}
              <button
                className="tree-project"
                draggable={false}
                onClick={() => select(p.id)}
                title={p.name}
              >
                <Folder size={15} className={`tree-folder ${p.art}`} />
                <span dir="auto">{p.name}</span>
              </button>
              <button
                type="button"
                className="project-drag-handle"
                disabled={!!query || savingOrder}
                aria-label={`${getLanguage() === "en" ? "Reorder project" : "Изменить порядок проекта"} ${p.name}`}
                title={getLanguage() === "en" ? "Drag to reorder · Alt + ↑ / ↓" : "Перетащите для сортировки · Alt + ↑ / ↓"}
                draggable={!query && !savingOrder}
                onDragStart={(event) => {
                  dragging.current = p;
                  event.dataTransfer.effectAllowed = "move";
                  event.dataTransfer.setData("text/plain", p.id);
                  const preview = document.createElement("canvas");
                  preview.width = preview.height = 1;
                  event.dataTransfer.setDragImage(preview, 0, 0);
                }}
                onDragEnd={() => { dragging.current = null; setDrop(null); }}
                onKeyDown={(event) => {
                  if (!event.altKey || !["ArrowUp", "ArrowDown"].includes(event.key) || query) return;
                  event.preventDefault();
                  const siblings = ordered.filter(item => item.parentId === p.parentId);
                  const target = siblings[siblings.findIndex(item => item.id === p.id) + (event.key === "ArrowUp" ? -1 : 1)];
                  if (target) void move(p, target, event.key === "ArrowDown");
                }}
              >
                <Menu size={14} strokeWidth={1.6} aria-hidden="true" />
              </button>
              <PinButton project={p} busy={pinBusy} toggle={togglePin} />
              {!p.parentId && (
                <button
                  className="tree-add"
                  title={t("Добавить подпроект")}
                  aria-label={t("Добавить подпроект в {v0}", { v0: p.name })}
                  onClick={() => addSub(p)}
                >
                  <Plus size={14} />
                </button>
              )}
            </div>
            {expanded && branch(p.id, depth + 1)}
          </motion.div>
        );
      });
  }
  return (
    <div
      className={`project-tree ${projects.some((project) => project.parentId) ? "has-branches" : ""}`}
      onDragLeave={event => {
        if (!event.currentTarget.contains(event.relatedTarget as Node)) setDrop(null);
      }}
    >
      {branch(null)}
      {query && !projects.some(matches) && (
        <p className="empty-note">{t("Ничего не найдено")}</p>
      )}
    </div>
  );
}
export function EmptyManager({
  create,
  data,
  refresh,
  notify,
  picker,
}: {
  create: () => void;
  data: Workspace;
  refresh: () => Promise<void>;
  notify: (message: string) => void;
  picker: () => void;
}) {
  return (
    <main className="manager-view">
      <div
        className="workspace-grid empty-manager-grid"
        style={
          {
            "--projects-preferred": data.projectsPanelWidth
              ? data.projectsPanelWidth + "px"
              : undefined,
            "--reference-width": data.referencePanelWidth + "px",
          } as CSSProperties
        }
      >
        <ProjectsPane
          data={data}
          refresh={refresh}
          notify={notify}
          picker={picker}
        >
          <button className="new-project-tree" onClick={create}>
            <Plus size={16} />
            {t("Новый проект")}
          </button>
        </ProjectsPane>
        <section className="project-main empty-workspace">
          <h1>{t("Нет проектов")}</h1>
          <button className="button primary" onClick={create}>
            <Plus size={17} />
            {t("Создать проект")}
          </button>
        </section>
        <aside className="references-panel panel" aria-label={t("Референсы")}>
          <div className="panel-heading">
            <h2>
              <Layers3 size={16} />
              {t("Референсы")}
            </h2>
          </div>
        </aside>
      </div>
    </main>
  );
}
export default function Manager({
  data,
  selected,
  refresh,
  select,
  picker,
  create,
  edit,
  notify,
  onDirtyChange,
  collapsedProjects,
  toggleProjectBranch,
}: {
  data: Workspace;
  selected: string;
  refresh: () => Promise<void>;
  select: (id: string) => void;
  picker: () => void;
  create: (parent?: Project) => void;
  edit: (p: Project) => void;
  notify: (s: string) => void;
  onDirtyChange: (dirty: boolean) => void;
  collapsedProjects: Set<string>;
  toggleProjectBranch: (id: string) => void;
}) {
  const project = data.projects.find((p) => p.id === selected)!;
  const StatusIcon = statusIcons[project.status];
  const refs = data.references.filter((r) => r.projectId === selected);
  const [editing, setEditing] = useState(false);
  const [planningDirty, setPlanningDirty] = useState(false);
  const [planningReset, setPlanningReset] = useState(0);
  const planPreference = usePanelPreference(
    "planCollapsed",
    data.planCollapsed,
    refresh,
    notify,
  );
  const [draft, setDraft] = useState("");
  const [draftHtml, setDraftHtml] = useState<string | null>(null);
  const dirty =
    draft !== project.description || draftHtml !== project.descriptionHtml;
  const descriptionTooLong =
    draft.length > 100000 || (draftHtml?.length ?? 0) > 200000;
  const safeDescription = useMemo(
    () =>
      project.descriptionHtml
        ? sanitizeDescription(project.descriptionHtml)
        : "",
    [project.descriptionHtml],
  );
  const [descriptionHasMore, setDescriptionHasMore] = useState(false);
  const [busy, setBusy] = useState(false);
  const [statusBusy, setStatusBusy] = useState(false);
  const [statusError, setStatusError] = useState("");
  const [pinBusy, setPinBusy] = useState(false);
  const [pinError, setPinError] = useState("");
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const [linkOpen, setLinkOpen] = useState(false);
  const [lightbox, setLightbox] = useState<Reference | null>(null);
  const [imageDirty, setImageDirty] = useState(false);
  const [imageSaving, setImageSaving] = useState(false);
  const [deleteRef, setDeleteRef] = useState<Reference | null>(null);
  const [deleteProject, setDeleteProject] = useState(false);
  const [query, setQuery] = useState("");
  const [mobile, setMobile] = useState<"references" | "projects" | null>(null);
  const [dragging, setDragging] = useState(false);
  const [pending, setPending] = useState<(() => void) | null>(null);
  const input = useRef<HTMLInputElement>(null);
  const searchInput = useRef<HTMLInputElement>(null);
  const descriptionText = useRef<HTMLDivElement>(null);
  const updateDescriptionFade = useCallback(() => {
    const el = descriptionText.current;
    if (el)
      setDescriptionHasMore(
        el.scrollHeight - el.scrollTop - el.clientHeight > 2,
      );
  }, []);
  useEffect(() => {
    const el = descriptionText.current;
    if (!el) return;
    updateDescriptionFade();
    const observer = new ResizeObserver(updateDescriptionFade);
    observer.observe(el);
    return () => observer.disconnect();
  }, [
    editing,
    project.description,
    project.descriptionHtml,
    updateDescriptionFade,
  ]);
  const pinnedProjects = data.projects.filter((p) => p.pinned);
  function projectPath(p: Project) {
    const names: string[] = [];
    let parent = data.projects.find((item) => item.id === p.parentId);
    while (parent) {
      names.unshift(parent.name);
      const parentId = parent.parentId;
      parent = data.projects.find((item) => item.id === parentId);
    }
    return names.join(" / ");
  }
  const pinnedMatches = pinnedProjects.filter((p) =>
    `${p.name} ${projectPath(p)}`
      .toLowerCase()
      .includes(query.trim().toLowerCase()),
  );
  async function togglePin(p: Project) {
    if (pinBusy) return;
    const returnToSearch =
      p.pinned && document.activeElement?.closest(".pin-board");
    setPinBusy(true);
    setPinError("");
    try {
      await api.update(p.id, { pinned: !p.pinned });
      await refresh();
      notify(p.pinned ? t("Проект откреплён") : t("Проект закреплён"));
      if (returnToSearch) searchInput.current?.focus();
    } catch (e) {
      setPinError((e as Error).message);
    } finally {
      setPinBusy(false);
    }
  }
  const statusDetails = useRef<HTMLDetailsElement>(null);
  useEffect(() => {
    function closeStatus(e: MouseEvent | KeyboardEvent) {
      const el = statusDetails.current;
      if (!el?.open) return;
      if (e instanceof KeyboardEvent) {
        if (e.key !== "Escape") return;
        el.open = false;
        el.querySelector("summary")?.focus();
      } else if (!el.contains(e.target as Node)) el.open = false;
    }
    document.addEventListener("click", closeStatus);
    document.addEventListener("keydown", closeStatus);
    return () => {
      document.removeEventListener("click", closeStatus);
      document.removeEventListener("keydown", closeStatus);
    };
  }, []);
  async function changeStatus(status: ProjectStatus) {
    if (statusBusy) return;
    setStatusError("");
    setStatusBusy(true);
    try {
      if (status !== project.status) {
        await api.update(selected, { status });
        await refresh();
        notify(
          t("Статус: {v0}", {
            v0: t(projectStatuses.find((s) => s.value === status)!.label),
          }),
        );
      }
      if (statusDetails.current) {
        statusDetails.current.open = false;
        statusDetails.current.querySelector("summary")?.focus();
      }
    } catch (e) {
      setStatusError((e as Error).message);
    } finally {
      setStatusBusy(false);
    }
  }
  useEffect(() => {
    setEditing(false);
    setError("");
    setDraft(project.description);
    setDraftHtml(project.descriptionHtml);
    setMobile(null);
  }, [selected, project.description, project.descriptionHtml]);
  useEffect(() => {
    if (!(editing && dirty) && !planningDirty && !imageDirty) return;
    const handler = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [editing, dirty, planningDirty, imageDirty]);
  useEffect(() => {
    onDirtyChange((editing && dirty) || planningDirty || imageDirty);
    return () => onDirtyChange(false);
  }, [editing, dirty, planningDirty, imageDirty, onDirtyChange]);
  function navigate(action: () => void) {
    if ((editing && dirty) || planningDirty || imageDirty) setPending(() => action);
    else action();
  }
  async function save() {
    setBusy(true);
    setError("");
    try {
      await api.update(selected, {
        description: draft,
        descriptionHtml: draftHtml,
      });
      await refresh();
      setEditing(false);
      notify(t("Описание сохранено"));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function upload(files: FileList | File[] | null) {
    if (!files?.length) return;
    setUploading(true);
    setError("");
    try {
      for (const file of Array.from(files)) {
        if (
          !["image/jpeg", "image/png", "image/webp", "image/gif"].includes(
            file.type,
          )
        )
          throw new Error(t("Добавьте изображение JPG, PNG, WebP или GIF."));
        if (file.size > 20 * 1024 * 1024)
          throw new Error(t("Размер одного изображения — до 20 МБ."));
        await api.image(selected, file);
      }
      notify(t("Референсы добавлены"));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      try {
        await refresh();
      } catch (e) {
        setError((e as Error).message);
      } finally {
        setUploading(false);
        if (input.current) input.current.value = "";
      }
    }
  }
  async function removeReference() {
    if (!deleteRef) return;
    setBusy(true);
    try {
      await api.removeRef(deleteRef.id);
      setDeleteRef(null);
      await refresh();
      notify(t("Референс удалён"));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function setCover(ref: Reference) {
    try {
      await api.update(selected, { coverId: ref.id });
      await refresh();
      notify(t("Обложка обновлена"));
    } catch (e) {
      setError((e as Error).message);
    }
  }
  return (
    <main className="manager-view">
      <div className="mobile-panel-tabs">
        <button
          onClick={() => setMobile(mobile === "projects" ? null : "projects")}
          aria-expanded={mobile === "projects"}
        >
          <ListTree size={16} /> {t("Проекты")}{" "}
        </button>
        <button
          onClick={() =>
            setMobile(mobile === "references" ? null : "references")
          }
          aria-expanded={mobile === "references"}
        >
          <Layers3 size={16} /> {t("Референсы")}{" "}
        </button>
      </div>
      <div
        className={`workspace-grid ${mobile ? "mobile-open" : ""}`}
        style={
          {
            "--reference-width": `${data.referencePanelWidth}px`,
            "--projects-preferred": data.projectsPanelWidth
              ? `${data.projectsPanelWidth}px`
              : undefined,
          } as CSSProperties
        }
      >
        <ProjectsPane
          data={data}
          refresh={refresh}
          notify={notify}
          picker={() => navigate(picker)}
          mobileVisible={mobile === "projects"}
        >
          <label className="project-search">
            <Search size={15} />
            <input
              ref={searchInput}
              placeholder={t("Найти проект…")}
              aria-label={t("Найти проект")}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </label>
          {pinnedProjects.length > 0 && (
            <section
              className="pin-board"
              aria-label={t("Закреплённые проекты")}
            >
              <h3 className="tree-section-label pin-board-heading">
                <Pin size={12} aria-hidden="true" /> {t("Закреплённые")}{" "}
                <span>{pinnedProjects.length}</span>
              </h3>
              {pinnedMatches.map((p) => (
                <div
                  key={p.id}
                  className={`pinned-row ${selected === p.id ? "active" : ""}`}
                >
                  <button
                    type="button"
                    className="pinned-project"
                    aria-label={t("Открыть закреплённый проект {v0}", {
                      v0: p.name,
                    })}
                    aria-current={selected === p.id ? "page" : undefined}
                    onClick={() => navigate(() => select(p.id))}
                    title={[projectPath(p), p.name].filter(Boolean).join(" / ")}
                  >
                    <Folder size={15} aria-hidden="true" />
                    <span>
                      <strong dir="auto">{p.name}</strong>
                      {p.parentId && <small>{projectPath(p)}</small>}
                    </span>
                  </button>
                  <PinButton project={p} busy={pinBusy} toggle={togglePin} />
                </div>
              ))}
              {!pinnedMatches.length && (
                <p className="empty-note">{t("Нет закреплённых по запросу")}</p>
              )}
            </section>
          )}
          {pinError && (
            <p className="error pin-error" role="alert">
              {pinError}
            </p>
          )}
          <div className="tree-section-label">{t("МОЯ КОЛЛЕКЦИЯ")}</div>
          <Tree
            projects={data.projects}
            selected={selected}
            query={query}
            togglePin={(p) => void togglePin(p)}
            pinBusy={pinBusy}
            refresh={refresh}
            notify={notify}
            collapsedProjects={collapsedProjects}
            toggleProjectBranch={toggleProjectBranch}
            select={(id) => navigate(() => select(id))}
            addSub={(p) => navigate(() => create(p))}
          />
          <button
            className="new-project-tree"
            onClick={() => navigate(() => create())}
          >
            <Plus size={16} /> {t("Новый проект")}{" "}
          </button>
          <div className="project-sidebar-bottom">
            <button
              className="delete-project"
              onClick={() => setDeleteProject(true)}
            >
              <Trash2 size={14} aria-hidden="true" />
              <span>{t("Удалить этот проект")}</span>
            </button>
          </div>
        </ProjectsPane>
        <section className="project-main project-main--planning">
          <div className="project-overline">
            <span className={`project-color ${project.art}`} />
            <span
              className="project-category"
              dir="auto"
              title={project.category || t("Личный проект")}
            >
              {project.category || t("Личный проект")}
            </span>
          </div>
          <div className="project-heading">
            <h1 title={project.name} dir="auto">
              {project.name}
            </h1>
            <div className="project-heading-actions">
              <details
                className="project-status"
                data-status={project.status}
                ref={statusDetails}
              >
                <summary
                  className="project-state"
                  aria-label={t("Статус проекта: {v0}", {
                    v0: t(
                      projectStatuses.find((s) => s.value === project.status)!
                        .label,
                    ),
                  })}
                >
                  <StatusIcon size={15} className="status-icon" aria-hidden="true" />
                  {t(
                    projectStatuses.find((s) => s.value === project.status)!
                      .label,
                  )}
                  <ChevronDown size={13} aria-hidden="true" />
                </summary>
                <div
                  className="project-status-menu"
                  role="group"
                  aria-label={t("Выберите статус проекта")}
                  aria-busy={statusBusy}
                >
                  <p className="status-menu-title">{t("Статус проекта")}</p>
                  {projectStatuses.map((status) => (
                    <button
                      key={status.value}
                      type="button"
                      className="status-option"
                      data-status={status.value}
                      aria-pressed={status.value === project.status}
                      disabled={statusBusy}
                      onClick={() => void changeStatus(status.value)}
                    >
                      <span className="status-dot" aria-hidden="true" />
                      <span>
                        <strong>{t(status.label)}</strong>
                        <small>{t(status.hint)}</small>
                      </span>
                      {status.value === project.status && (
                        <Check size={15} aria-hidden="true" />
                      )}
                    </button>
                  ))}
                  {statusError && (
                    <p className="error" role="alert">
                      {statusError}
                    </p>
                  )}
                </div>
              </details>
              <IconButton
                label={t("Настройки проекта")}
                onClick={() => navigate(() => edit(project))}
              >
                <Edit3 size={19} />
              </IconButton>
            </div>
          </div>
          <DescriptionPanel
            actions={
              !editing ? (
                <button
                  className="button small secondary"
                  title={t("Редактировать")}
                  onClick={() => {
                    setDraft(project.description);
                    setDraftHtml(project.descriptionHtml);
                    setEditing(true);
                  }}
                >
                  <Edit3 size={14} /> {t("Редактировать")}{" "}
                </button>
              ) : (
                <span className="draft-label">
                  {dirty ? t("Не сохранено") : t("Без изменений")}
                </span>
              )
            }
          >
            {editing ? (
              <div className="description-editor">
                <Suspense
                  fallback={
                    <div className="editor-loading">
                      {t("Загрузка редактора…")}
                    </div>
                  }
                >
                  <RichTextEditor
                    text={project.description}
                    html={project.descriptionHtml}
                    disabled={busy}
                    autoFocus
                    onChange={(text, html) => {
                      setDraft(text);
                      setDraftHtml(html);
                    }}
                  />
                </Suspense>
                {descriptionTooLong && (
                  <p className="error" role="alert">
                    {" "}
                    {t(
                      "Описание слишком длинное. Сократите текст или форматирование.",
                    )}{" "}
                  </p>
                )}
                <div className="editor-actions">
                  <span>
                    {draft.length.toLocaleString(getLanguage())} {t("символов")}
                  </span>
                  <button
                    className="button small secondary"
                    disabled={busy}
                    onClick={() => setEditing(false)}
                  >
                    {" "}
                    {t("Отмена")}{" "}
                  </button>
                  <button
                    className="button small primary"
                    onClick={() => void save()}
                    disabled={busy || descriptionTooLong}
                  >
                    {busy ? t("Сохраняем…") : t("Сохранить")}
                    <Check size={15} />
                  </button>
                </div>
              </div>
            ) : (
              <div
                className="description-scroll"
                data-more={descriptionHasMore}
              >
                <div
                  ref={descriptionText}
                  className={`description-text ${!project.description ? "empty-description" : ""}`}
                  dir="auto"
                  role="region"
                  aria-label={t("Описание проекта")}
                  tabIndex={0}
                  onScroll={updateDescriptionFade}
                >
                  {safeDescription ? (
                    <div
                      className="rich-document"
                      dangerouslySetInnerHTML={{ __html: safeDescription }}
                    />
                  ) : (
                    project.description || t("Добавьте описание проекта.")
                  )}
                </div>
              </div>
            )}
            <div className="description-footer">
              <span>
                {" "}
                {t("Изменено")}{" "}
                {new Intl.DateTimeFormat(getLanguage(), {
                  day: "numeric",
                  month: "short",
                }).format(new Date(project.updatedAt))}
              </span>
            </div>
          </DescriptionPanel>
          {error && (
            <p className="error" role="alert">
              {error}
            </p>
          )}
          <ProjectPlan
            key={`${selected}-${planningReset}`}
            projectId={selected}
            entries={data.planningEntries.filter(
              (entry) => entry.projectId === selected,
            )}
            refresh={refresh}
            onDirtyChange={setPlanningDirty}
            compact={editing}
            collapsed={planPreference.collapsed}
            onToggle={() => void planPreference.toggle()}
            collapseBusy={planPreference.busy}
          />
          {!project.parentId && (
            <div className="project-next">
              <button
                className="button small secondary"
                onClick={() => navigate(() => create(project))}
              >
                <Plus size={15} /> {t("Подпроект")}{" "}
              </button>
            </div>
          )}
        </section>
        <ResizablePane
          side="references"
          initialWidth={data.referencePanelWidth}
          refresh={refresh}
          notify={notify}
        >
          <aside
            className={`references-panel panel ${mobile === "references" ? "mobile-visible" : ""}`}
            aria-label={t("Референсы")}
          >
            <div className="panel-heading">
              <h2>
                <Layers3 size={16} /> {t("Референсы")}{" "}
              </h2>
            </div>
            <input
              type="file"
              multiple
              accept="image/jpeg,image/png,image/webp,image/gif"
              hidden
              ref={input}
              onChange={(e) => void upload(e.target.files)}
            />
            <button
              className={`upload-zone ${dragging ? "drag-over" : ""}`}
              disabled={uploading}
              onClick={() => input.current?.click()}
              onDragOver={(e) => {
                e.preventDefault();
                setDragging(true);
              }}
              onDragLeave={() => setDragging(false)}
              onDrop={(e) => {
                e.preventDefault();
                setDragging(false);
                void upload(e.dataTransfer.files);
              }}
            >
              {uploading ? (
                <LoaderCircle size={23} className="spin" />
              ) : (
                <Upload size={23} />
              )}
              <strong>
                {uploading ? t("Загрузка…") : t("Добавить изображения")}
              </strong>
              <small>{t("JPG, PNG, WebP, GIF · до 20 МБ")}</small>
            </button>
            <button className="add-link" onClick={() => setLinkOpen(true)}>
              <Link2 size={15} /> {t("Добавить ссылку")} <Plus size={15} />
            </button>
            {error && (
              <p className="error" role="alert">
                {error}
              </p>
            )}
            <div className="reference-list">
              {refs.map((ref) => (
                <article className={`reference-item ${ref.kind}${ref.clip ? " has-clip" : ""}`} key={ref.id}>
                  {ref.kind === "image" ? (
                    <>
                      <button
                        className="reference-image"
                        onClick={() => setLightbox(ref)}
                      >
                        <img src={ref.url} alt={ref.title} loading="lazy" />
                      </button>
                      <div className="reference-caption">
                        <span title={ref.title}>{ref.title}</span>
                        <IconButton
                          label={t("Удалить {v0}", { v0: ref.title })}
                          className="danger"
                          onClick={() => setDeleteRef(ref)}
                        >
                          <X size={13} />
                        </IconButton>
                      </div>
                    </>
                  ) : (
                    <>
                      <a
                        href={ref.url}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        <span className="link-icon">
                          <Link2 size={18} />
                        </span>
                        <span>
                          <strong>
                            {ref.title || new URL(ref.url).hostname}
                          </strong>
                          <small>{new URL(ref.url).hostname}</small>
                        </span>
                        <ArrowUpRight size={15} />
                      </a>
                      <IconButton
                        label={t("Удалить {v0}", {
                          v0: ref.title || t("ссылку"),
                        })}
                        className="danger"
                        onClick={() => setDeleteRef(ref)}
                      >
                        <X size={13} />
                      </IconButton>
                      {ref.clip && <details className="reference-clip">
                        <summary title={t("Сохранённый фрагмент")}>
                          <FileText size={13} />
                          <span>{ref.clip.text.slice(0, 120)}</span>
                          <ChevronDown size={13} />
                        </summary>
                        <time dateTime={ref.clip.capturedAt}>{t("Сохранено {date}", { date: new Date(ref.clip.capturedAt).toLocaleDateString(getLanguage(), { day: "numeric", month: "short", year: "numeric" }) })}</time>
                        <div className="reference-clip-text">{ref.clip.text}</div>
                      </details>}
                    </>
                  )}
                </article>
              ))}
              {!refs.length && (
                <div className="reference-empty">
                  <FolderObject />
                  <p>{t("Нет референсов")}</p>
                </div>
              )}
            </div>
          </aside>
        </ResizablePane>
      </div>
      {mobile && (
        <button
          className="mobile-panel-close button secondary"
          onClick={() => setMobile(null)}
        >
          <X size={16} /> {t("Закрыть панель")}{" "}
        </button>
      )}
      {linkOpen && (
        <LinkForm
          close={() => setLinkOpen(false)}
          save={async (title, url) => {
            await api.link(selected, title, url);
            await refresh();
            notify(t("Ссылка добавлена"));
          }}
        />
      )}
      {lightbox && (
        <Modal
          title={lightbox.title}
          close={() => { if (!imageSaving) navigate(() => setLightbox(null)); }}
          className="image-modal"
          dismissOnBackdrop={false}
        >
          {error && (
            <p className="error" role="alert">
              {error}
            </p>
          )}
          <ImageViewer
            key={lightbox.id}
            src={lightbox.url}
            title={lightbox.title}
            referenceId={lightbox.id}
            onDirtyChange={setImageDirty}
            onSavingChange={setImageSaving}
          />
          <button
            className="button primary"
            disabled={imageSaving}
            onClick={() => void setCover(lightbox)}
          >
            <ImagePlus size={16} />
            {project.coverId === lightbox.id
              ? t("Текущая обложка")
              : t("Использовать как обложку")}
          </button>
        </Modal>
      )}
      {deleteRef && (
        <Modal
          title={t("Удалить референс?")}
          close={() => setDeleteRef(null)}
          className="delete-confirmation"
        >
          <p className="modal-copy">
            {t("«{name}» будет удалён с этого компьютера.", {
              name: deleteRef.title || t("Ссылка"),
            })}{" "}
          </p>
          <div className="form-actions">
            <button
              className="button secondary"
              onClick={() => setDeleteRef(null)}
            >
              {" "}
              {t("Оставить")}{" "}
            </button>
            <button
              className="button danger"
              disabled={busy}
              onClick={() => void removeReference()}
            >
              {" "}
              {t("Удалить")}{" "}
            </button>
          </div>
        </Modal>
      )}
      {deleteProject && (
        <Modal
          title={t("Удалить проект?")}
          close={() => setDeleteProject(false)}
          className="delete-confirmation"
        >
          <p className="modal-copy">
            {t(
              "«{name}», его подпроекты, этапы, заметки и референсы будут удалены без возможности восстановления.",
              { name: project.name },
            )}{" "}
          </p>
          <div className="form-actions">
            <button
              className="button secondary"
              onClick={() => setDeleteProject(false)}
            >
              {" "}
              {t("Оставить")}{" "}
            </button>
            <button
              className="button danger"
              disabled={busy}
              onClick={async () => {
                setBusy(true);
                try {
                  await api.remove(selected);
                  await refresh();
                  notify(t("Проект удалён"));
                } catch (e) {
                  setError((e as Error).message);
                } finally {
                  setBusy(false);
                  setDeleteProject(false);
                }
              }}
            >
              {" "}
              {t("Удалить проект")}{" "}
            </button>
          </div>
        </Modal>
      )}
      {pending && (
        <Modal title={t("Сохранить изменения?")} close={() => setPending(null)}>
          <p className="modal-copy">
            {" "}
            {t(
              "Есть несохранённые изменения. Можно остаться и сохранить их или продолжить без сохранения.",
            )}{" "}
          </p>
          <div className="form-actions">
            <button
              className="button secondary"
              onClick={() => setPending(null)}
            >
              {" "}
              {t("Остаться")}{" "}
            </button>
            <button
              className="button primary"
              onClick={() => {
                const action = pending;
                setPending(null);
                setEditing(false);
                setPlanningReset((value) => value + 1);
                setPlanningDirty(false);
                action();
              }}
            >
              {" "}
              {t("Не сохранять и продолжить")}{" "}
            </button>
          </div>
        </Modal>
      )}
    </main>
  );
}
