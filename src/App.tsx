import { t, setLanguage, useLanguage } from "./i18n";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { AnimatePresence, motion } from "motion/react";
import { api } from "./api";
import { IconButton, Modal, ProjectForm } from "./ui";
import Manager, { EmptyManager } from "./Manager";
import Picker from "./Picker";
import Assistant, { assistantLabel } from "./Assistant";
import StorageSettings from "./StorageSettings";
import Brand from "./Brand";
import "./Brand.css";
import type { Appearance, PickerTheme, Project, Workspace } from "./types";
import type { Language } from "./translations.mjs";
import {
  X,
  Globe2,
  Coffee,
  ArrowUpRight,
  Bot,
  Check,
  CircleHelp,
  ListTree,
  LoaderCircle,
  Plus,
} from "lucide-react";
export default function App() {
  const language = useLanguage();
  const [languageBusy, setLanguageBusy] = useState(false);
  const [themeBusy, setThemeBusy] = useState(false);
  const [appearanceBusy, setAppearanceBusy] = useState(false);
  const [data, setData] = useState<Workspace | null>(null);
  const [failure, setFailure] = useState("");
  const [screen, setScreen] = useState<"picker" | "manager">("picker");
  const [selected, setSelected] = useState("");
  const [collapsedProjects, setCollapsedProjects] = useState<Set<string> | null>(null);
  const [form, setForm] = useState<{
    parent?: Project;
    initial?: Project;
  } | null>(null);
  const [toast, setToast] = useState("");
  const [help, setHelp] = useState(false);
  const [assistantOpen, setAssistantOpen] = useState(false);
  const [workspaceDirty, setWorkspaceDirty] = useState(false);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const refresh = useCallback(async () => {
    const next = await api.load();
    setCollapsedProjects(current => current ?? new Set(next.projects.flatMap(project => project.parentId ? [project.parentId] : [])));
    setLanguage(next.language);
    setData(next);
    setSelected((current) =>
      next.projects.some((project) => project.id === current)
        ? current
        : (next.projects[0]?.id ?? ""),
    );
  }, []);
  useLayoutEffect(() => {
    document.documentElement.dataset.accent = data?.accentColor ?? "blue";
    document.documentElement.dataset.appearance = data?.appearance ?? "dark";
  }, [data?.accentColor, data?.appearance]);
  useEffect(() => {
    document.documentElement.lang = language;
    document.documentElement.dir = language === "he" ? "rtl" : "ltr";
    document.title = t("ProjiSpace — ваши проекты");
  }, [language]);
  async function changeLanguage(next: Language) {
    if (languageBusy || next === language) return;
    setLanguageBusy(true);
    try {
      await api.language(next);
      setLanguage(next);
      setData((current) =>
        current ? { ...current, language: next } : current,
      );
    } catch {
      notify(t("Не удалось изменить язык. Попробуйте ещё раз."));
    } finally {
      setLanguageBusy(false);
    }
  }
  useEffect(() => {
    void refresh().catch((e) => setFailure(e.message));
    return () => {
      if (toastTimer.current) clearTimeout(toastTimer.current);
    };
  }, [refresh]);
  function notify(message: string) {
    setToast(message);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(""), 3200);
  }
  async function changeTheme(next: PickerTheme) {
    if (!data || themeBusy || next === data.pickerTheme) return;
    const previous = data.pickerTheme;
    setThemeBusy(true);
    setData((current) =>
      current ? { ...current, pickerTheme: next } : current,
    );
    try {
      await api.pickerTheme(next);
    } catch {
      setData((current) =>
        current ? { ...current, pickerTheme: previous } : current,
      );
      notify(t("Не удалось сохранить тему"));
    } finally {
      setThemeBusy(false);
    }
  }
  function open(id: string) {
    setSelected(id);
    setScreen("manager");
  }
  const create = (parent?: Project) => setForm({ parent });
  async function changeAppearance(next: Appearance) {
    if (!data || appearanceBusy || next === data.appearance) return;
    const previous = data.appearance;
    setAppearanceBusy(true);
    setData((current) =>
      current ? { ...current, appearance: next } : current,
    );
    try {
      await api.appearance(next);
    } catch {
      setData((current) =>
        current ? { ...current, appearance: previous } : current,
      );
      notify(t("Не удалось сохранить оформление"));
    } finally {
      setAppearanceBusy(false);
    }
  }
  return (
    <div className="app-shell">
      <header className="app-header">
        <div className="header-brand-panel">
          <button
            className="brand"
            popoverTarget="creator-card"
            aria-label={t("О ProjiSpace")}
          >
            <Brand />
          </button>
        </div>
        <div className="header-actions">
          <IconButton
            label={assistantLabel(language)}
            disabled={!data || !!form}
            onClick={() => {
              if (workspaceDirty)
                notify(
                  t(
                    "Есть несохранённые изменения. Можно остаться и сохранить их или продолжить без сохранения.",
                  ),
                );
              else setAssistantOpen(true);
            }}
          >
            <Bot size={19} />
          </IconButton>
          {screen === "manager" && (
            <IconButton
              label={t("Как это работает")}
              onClick={() => setHelp(true)}
            >
              <CircleHelp size={18} />
            </IconButton>
          )}
          {screen === "picker" && (
            <button
              className="button secondary browse-button"
              aria-label={t("Все проекты")}
              title={t("Все проекты")}
              disabled={!data?.projects.length}
              onClick={() => data?.projects[0] && open(data.projects[0].id)}
            >
              <ListTree size={16} />
              <span>{t("Все проекты")}</span>
            </button>
          )}
          {screen === "picker" && (
            <button
              className="button primary header-create"
              aria-label={t("Новый проект")}
              onClick={() => create()}
              disabled={!data}
            >
              <Plus size={17} />
              <span>{t("Новый проект")}</span>
            </button>
          )}
        </div>
      </header>
      <div
        id="creator-card"
        className="creator-card"
        popover="auto"
        role="dialog"
        aria-labelledby="creator-name"
      >
        <div className="creator-card-heading">
          <span className="creator-product">
            <Brand />
          </span>
          <button
            type="button"
            className="icon-button"
            popoverTarget="creator-card"
            popoverTargetAction="hide"
            aria-label={t("Закрыть карточку автора")}
            title={t("Закрыть")}
          >
            <X size={17} />
          </button>
        </div>
        <div className="creator-identity">
          <p>{t("Автор проекта")}</p>
          <h2 id="creator-name">
            pl.workshop<span aria-hidden="true">✳</span>
          </h2>
        </div>
        <a
          className="creator-website"
          href="https://plworkshop.xyz"
          target="_blank"
          rel="noopener noreferrer"
        >
          <Globe2 size={17} aria-hidden="true" />
          <span>plworkshop.xyz</span>
          <ArrowUpRight size={18} aria-hidden="true" />
        </a>
        <a
          className="creator-website creator-donate"
          href="https://ko-fi.com/pl_workshop"
          target="_blank"
          rel="noopener noreferrer"
        >
          <Coffee size={17} aria-hidden="true" />
          <span>{t("Поддержать на Ko-fi")}</span>
          <ArrowUpRight size={18} aria-hidden="true" />
        </a>
        <div className="creator-card-footer">© 2026</div>
      </div>
      {!data ? (
        <main className="loading-view">
          {failure ? (
            <>
              <h1>{t("Не удалось открыть студию")}</h1>
              <p role="alert">{failure}</p>
              <button
                className="button primary"
                onClick={() => {
                  setFailure("");
                  void refresh().catch((e) => setFailure(e.message));
                }}
              >
                {" "}
                {t("Попробовать ещё раз")}{" "}
              </button>
            </>
          ) : (
            <>
              <LoaderCircle className="spin" size={28} />
              <p>{t("Открываем вашу студию…")}</p>
            </>
          )}
        </main>
      ) : screen === "manager" ? (
        data.projects.some((p) => p.id === selected) ? (
          <Manager
            key={selected}
            data={data}
            selected={selected}
            refresh={refresh}
            select={setSelected}
            collapsedProjects={collapsedProjects ?? new Set<string>()}
            toggleProjectBranch={(id) => setCollapsedProjects(current => {
              const next = new Set(current ?? []);
              if (next.has(id)) next.delete(id);
              else next.add(id);
              return next;
            })}
            picker={() => setScreen("picker")}
            create={create}
            edit={(initial) => setForm({ initial })}
            notify={notify}
            onDirtyChange={setWorkspaceDirty}
          />
        ) : (
          <EmptyManager
            picker={() => setScreen("picker")}
            create={() => create()}
            data={data}
            refresh={refresh}
            notify={notify}
          />
        )
      ) : (
        <Picker
          key={data.projects
            .filter((p) => !p.parentId)
            .map((p) => p.id)
            .join(",")}
          projects={data.projects}
          references={data.references}
          language={language}
          languageBusy={languageBusy}
          onLanguageChange={changeLanguage}
          theme={data.pickerTheme}
          appearance={data.appearance}
          onAppearanceChange={changeAppearance}
          appearanceBusy={appearanceBusy}
          onThemeChange={changeTheme}
          themeBusy={themeBusy}
          openProject={open}
          newProject={() => create()}
          browse={() => data.projects[0] && open(data.projects[0].id)}
        />
      )}
      {form && (
        <ProjectForm
          {...form}
          close={() => setForm(null)}
          save={async (values) => {
            const project = form.initial
              ? await api.update(form.initial.id, values)
              : await api.create(values);
            await refresh();
            notify(form.initial ? t("Проект обновлён") : t("Проект создан"));
            if (form.parent) open(project.id);
          }}
        />
      )}
      {help && (
        <Modal title={t("Ваша личная студия")} close={() => setHelp(false)}>
          <div className="help-content">
            <p>
              {" "}
              {t(
                "ProjiSpace помогает выбрать один проект и собрать всё необходимое для работы.",
              )}{" "}
            </p>
            <p>
              <strong>Picker.</strong>{" "}
              {t(
                "Свайпайте вправо, если хочется заняться проектом, и влево, если пока отложить. Можно использовать кнопки или стрелки клавиатуры. «Да» проходят в следующий раунд, пока не останется один проект.",
              )}{" "}
            </p>
            <p>
              <strong>{t("Рабочее пространство.")}</strong>{" "}
              {t(
                "Организуйте проекты слева, редактируйте описание по центру и добавляйте референсы справа.",
              )}{" "}
            </p>
            <p>
              <strong>{t("Локальное хранение.")}</strong>{" "}
              {t(
                "Проекты находятся в SQLite, изображения — в папке files. Для резервной копии закройте приложение и скопируйте всю папку данных.",
              )}{" "}
            </p>
            <StorageSettings currentPath={data?.storagePath || "project-sidequest/data"} />
            <p className="muted">
              {" "}
              {t(
                "Начальная коллекция содержит четыре демо-проекта. Их можно изменить или удалить.",
              )}{" "}
            </p>
            <button className="button primary" onClick={() => setHelp(false)}>
              {" "}
              {t("Понятно")} <Check size={16} />
            </button>
          </div>
        </Modal>
      )}
      <AnimatePresence>
        {toast && (
          <motion.div
            className="toast"
            role="status"
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 8 }}
          >
            <span>
              <Check size={16} />
            </span>
            {toast}
          </motion.div>
        )}
      </AnimatePresence>
      <Assistant
        openProject={open}
        open={assistantOpen}
        close={() => setAssistantOpen(false)}
        selected={screen === "manager" ? selected : null}
        projectName={
          screen === "manager"
            ? (data?.projects.find((project) => project.id === selected)
                ?.name ?? null)
            : null
        }
        refresh={refresh}
      />
    </div>
  );
}
