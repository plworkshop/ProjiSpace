import { t, getLanguage } from "./i18n";
import { lazy, Suspense, useEffect, useRef, useState } from "react";
import type { FormEvent, ReactNode } from "react";
import { Art, artNames } from "./Art";
import type { Art as ArtType, Project } from "./types";
import { ArrowRight, ChevronDown, Link2, X } from "lucide-react";
import "./ProjectForm.css";
const RichTextEditor = lazy(() => import("./RichTextEditor"));
export function IconButton({
  label,
  children,
  onClick,
  disabled = false,
  className = "",
}: {
  label: string;
  children: ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  className?: string;
}) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      className={`icon-button ${className}`}
      onClick={onClick}
      disabled={disabled}
    >
      {children}
    </button>
  );
}
export function Modal({
  title,
  children,
  close,
  className = "",
  dismissOnBackdrop = true,
}: {
  title: string;
  children: ReactNode;
  close: () => void;
  className?: string;
  dismissOnBackdrop?: boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const el = ref.current!;
    el.showModal();
    return () => el.close();
  }, []);
  return (
    <dialog
      ref={ref}
      className={`modal ${className}`}
      onCancel={(e) => {
        e.preventDefault();
        e.stopPropagation();
        close();
      }}
      onKeyDown={(e) => {
        if (e.key === "Escape" && !e.defaultPrevented) {
          e.preventDefault();
          e.stopPropagation();
          close();
        }
      }}
      onClick={(e) => {
        if (dismissOnBackdrop && e.target === e.currentTarget) close();
      }}
      aria-label={title}
    >
      <div className="modal-heading">
        <h2>{title}</h2>
        <IconButton label={t("Закрыть")} onClick={close}>
          <X size={20} />
        </IconButton>
      </div>
      {children}
    </dialog>
  );
}
export function ProjectForm({
  parent,
  initial,
  save,
  close,
}: {
  parent?: Project;
  initial?: Project;
  save: (values: Partial<Project>) => Promise<void>;
  close: () => void;
}) {
  const [art, setArt] = useState<ArtType>(() => {
    const covers = Object.keys(artNames) as ArtType[];
    return initial?.art ?? covers[Math.floor(Math.random() * covers.length)];
  });
  const initialArt = useRef(art);
  const [name, setName] = useState(initial?.name ?? "");
  const [category, setCategory] = useState(initial?.category ?? "");
  const [confirmClose, setConfirmClose] = useState(false);
  const [descriptionExpanded, setDescriptionExpanded] = useState(false);
  const [coversOpen, setCoversOpen] = useState(false);
  const [description, setDescription] = useState(initial?.description || "");
  const [descriptionHtml, setDescriptionHtml] = useState<string | null>(
    initial?.descriptionHtml ?? null,
  );
  const descriptionTooLong =
    description.length > 100000 || (descriptionHtml?.length ?? 0) > 200000;
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const dirty =
    name !== (initial?.name ?? "") ||
    category !== (initial?.category ?? "") ||
    description !== (initial?.description ?? "") ||
    descriptionHtml !== (initial?.descriptionHtml ?? null) ||
    art !== initialArt.current;
  useEffect(() => {
    if (!dirty && !busy) return;
    const handler = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [dirty, busy]);
  function requestClose() {
    if (busy) return;
    if (descriptionExpanded) setDescriptionExpanded(false);
    else if (dirty) setConfirmClose(true);
    else close();
  }
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (descriptionExpanded) return;
    const data = new FormData(e.currentTarget);
    setBusy(true);
    try {
      await save({
        name: String(data.get("name")).trim(),
        category: String(data.get("category")).trim(),
        description,
        descriptionHtml,
        art,
        ...(!initial ? { parentId: parent?.id ?? null } : {}),
      });
      close();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal
      title={
        descriptionExpanded
          ? t("Описание проекта")
          : initial
            ? t("Настройки проекта")
            : parent
              ? t("Новый подпроект")
              : t("Новый проект")
      }
      close={requestClose}
      dismissOnBackdrop={false}
      className={
        descriptionExpanded
          ? "project-form-modal project-form-modal--expanded"
          : "project-form-modal"
      }
    >
      <form
        onSubmit={submit}
        className="form-stack"
        onKeyDownCapture={(event) => {
          if (
            descriptionExpanded &&
            event.key === "Escape" &&
            !(event.target as HTMLElement).closest(".rich-link-form")
          ) {
            event.preventDefault();
            event.stopPropagation();
            setDescriptionExpanded(false);
          }
        }}
      >
        {parent && (
          <p className="muted">
            {t("Внутри проекта «{name}»", { name: parent.name })}
          </p>
        )}
        <label>
          {" "}
          {t("Название")}{" "}
          <input
            autoFocus
            name="name"
            dir="auto"
            required
            maxLength={120}
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder={t("У каждой идеи есть имя")}
          />
        </label>
        <label>
          {" "}
          {t("Направление")}{" "}
          <input
            name="category"
            dir="auto"
            maxLength={60}
            value={category}
            onChange={(event) => setCategory(event.target.value)}
            placeholder={t("Например, дизайн или разработка")}
          />
        </label>
        <div className="form-description">
          <span>{t("Описание")}</span>
          <Suspense
            fallback={
              <div className="editor-loading">{t("Загрузка редактора…")}</div>
            }
          >
            <RichTextEditor
              text={initial?.description || ""}
              html={initial?.descriptionHtml ?? null}
              disabled={busy}
              expanded={descriptionExpanded}
              onExpand={() => setDescriptionExpanded((value) => !value)}
              onChange={(text, html) => {
                setDescription(text);
                setDescriptionHtml(html);
              }}
            />
          </Suspense>
        </div>
        <div className="description-expanded-footer">
          <span>
            {description.length.toLocaleString(getLanguage())} {t("символов")}
          </span>
          <button
            type="button"
            className="button secondary"
            onClick={() => setDescriptionExpanded(false)}
          >
            {t("Вернуться к проекту")}
          </button>
        </div>
        <div className="form-cover" data-open={coversOpen}>
          <button
            type="button"
            className="form-cover-toggle"
            aria-expanded={coversOpen}
            aria-controls="project-cover-options"
            onClick={() => setCoversOpen((value) => !value)}
          >
            <span>{t("Обложка карточки")}</span>
            <span className="form-cover-value">{t(artNames[art])}</span>
            <ChevronDown size={15} aria-hidden="true" />
          </button>
          <div
            className="form-cover-reveal"
            inert={!coversOpen}
            id="project-cover-options"
          >
            <div
              className="form-cover-content"
              role="group"
              aria-label={t("Обложка карточки")}
            >
              <div className="art-options">
                {(Object.keys(artNames) as ArtType[]).map((kind) => (
                  <button
                    key={kind}
                    type="button"
                    className={art === kind ? "selected" : ""}
                    onClick={() => setArt(kind)}
                    aria-pressed={art === kind}
                  >
                    <Art kind={kind} />
                    <span>{t(artNames[kind])}</span>
                  </button>
                ))}
              </div>
              <p className="field-hint">
                {" "}
                {t("Своё изображение можно добавить из референсов.")}{" "}
              </p>
            </div>
          </div>
        </div>
        {descriptionTooLong && (
          <p role="alert" className="error">
            {" "}
            {t(
              "Описание слишком длинное. Сократите текст или форматирование.",
            )}{" "}
          </p>
        )}
        {error && (
          <p role="alert" className="error">
            {error}
          </p>
        )}
        <div className="form-actions">
          <button
            type="button"
            className="button secondary"
            disabled={busy}
            onClick={requestClose}
          >
            {" "}
            {t("Отмена")}{" "}
          </button>
          <button
            className="button primary"
            disabled={busy || descriptionTooLong}
          >
            {busy
              ? t("Сохраняем…")
              : initial
                ? t("Сохранить")
                : t("Создать проект")}
            <ArrowRight size={16} />
          </button>
        </div>
      </form>
      {confirmClose && (
        <Modal
          title={t("Сохранить изменения?")}
          close={() => setConfirmClose(false)}
          dismissOnBackdrop={false}
        >
          <p className="modal-copy">
            {t(
              "Есть несохранённые изменения. Можно остаться и сохранить их или продолжить без сохранения.",
            )}
          </p>
          <div className="form-actions">
            <button type="button" className="button secondary" onClick={close}>
              {t("Не сохранять и продолжить")}
            </button>
            <button
              type="button"
              className="button primary"
              onClick={() => setConfirmClose(false)}
            >
              {t("Остаться")}
            </button>
          </div>
        </Modal>
      )}
    </Modal>
  );
}
export function LinkForm({
  save,
  close,
}: {
  save: (title: string, url: string) => Promise<void>;
  close: () => void;
}) {
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    setBusy(true);
    try {
      await save(String(f.get("title")), String(f.get("url")));
      close();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal title={t("Добавить ссылку")} close={close}>
      <form className="form-stack" onSubmit={submit}>
        <label>
          {" "}
          {t("Адрес")}{" "}
          <input
            autoFocus
            type="url"
            dir="ltr"
            name="url"
            required
            placeholder="https://…"
          />
        </label>
        <label>
          {" "}
          {t("Название")}{" "}
          <input
            name="title"
            dir="auto"
            maxLength={200}
            placeholder={t("Что здесь вдохновляет?")}
          />
        </label>
        {error && (
          <p role="alert" className="error">
            {error}
          </p>
        )}
        <button className="button primary" disabled={busy}>
          {busy ? t("Добавляем…") : t("Добавить ссылку")}
          <Link2 size={16} />
        </button>
      </form>
    </Modal>
  );
}
