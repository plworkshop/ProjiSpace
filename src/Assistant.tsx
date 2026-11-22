import { useEffect, useRef, useState } from "react";
import {
  Bot,
  X,
  Send,
  Square,
  Check,
  RefreshCw,
  LoaderCircle,
  MessageSquarePlus,
  Settings2,
  Mic,
} from "lucide-react";
import { api } from "./api";
import { t, useLanguage } from "./i18n";
import type {
  AssistantOperation,
  AssistantPlan,
  AssistantStatus,
} from "./types";
import "./Assistant.css";
import AssistantSetup, { setupRunning } from "./AssistantSetup";
import VoiceDictation from "./VoiceDictation";

const en = {
  title: "Local assistant",
  subtitle: "Ollama · on this computer",
  message: "Message to assistant",
  placeholder: "Describe what you want to do…",
  send: "Send",
  thinking: "Preparing a proposal…",
  stop: "Stop",
  review: "Review changes",
  apply: "Apply changes",
  applied: "Changes applied",
  discard: "Discard proposal",
  empty: "What would you like to do?",
  intro:
    "Create projects, update descriptions, or plan your next steps. You review changes before they are applied.",
  context: "Current project",
  all: "All projects",
  reconnect: "Check connection",
  offline: "The selected model is unavailable. Choose another model in Model settings.",
  cancelled: "Request stopped. No changes were made.",
  expired:
    "The proposal is no longer current. Discard it and send your request again.",
  unavailable: "Ollama is unavailable. Start it and check the connection.",
  invalid:
    "The model could not prepare valid changes. Try a more specific request.",
  target: "The project name is missing or ambiguous. Specify its full name.",
  busy: "Another request is running. Try again shortly.",
  contextLarge: "This workspace is too large for the current model context.",
  root: "Main project",
  yes: "Yes",
  no: "No",
  previous: "Previous value",
  example: "Suggest three milestones for the current project, with dates.",
  exampleLabel: "Plan this project",
  applyFailed: "Could not apply changes. Check the proposal and try again.",
  close: "Close assistant",
  date: "Date",
  kind: "Type",
  parent: "Parent project",
  noChanges: "No changes were made.",
  newChat: "New conversation",
  setup: "Model settings",
};
const ru: typeof en = {
  title: "Локальный помощник",
  subtitle: "Ollama · на этом компьютере",
  message: "Сообщение помощнику",
  placeholder: "Опишите, что нужно сделать…",
  send: "Отправить",
  thinking: "Готовим предложение…",
  stop: "Остановить",
  review: "Проверьте изменения",
  apply: "Применить изменения",
  applied: "Изменения применены",
  discard: "Отменить предложение",
  empty: "Что нужно сделать?",
  intro:
    "Создавайте проекты, редактируйте описания и планируйте работу. Перед применением вы проверяете изменения.",
  context: "Текущий проект",
  all: "Все проекты",
  reconnect: "Проверить подключение",
  offline: "Выбранная модель недоступна. Выберите другую в настройках модели.",
  cancelled: "Запрос остановлен. Изменения не внесены.",
  expired: "Предложение устарело. Отмените его и отправьте запрос заново.",
  unavailable: "Ollama недоступна. Запустите её и проверьте подключение.",
  invalid:
    "Модель не смогла подготовить корректные изменения. Уточните запрос.",
  target:
    "Название проекта не найдено или неоднозначно. Укажите его полностью.",
  busy: "Другой запрос ещё выполняется. Повторите чуть позже.",
  contextLarge:
    "Рабочее пространство слишком большое для контекста этой модели.",
  root: "Основной проект",
  yes: "Да",
  no: "Нет",
  previous: "Прежнее значение",
  example: "Предложи три этапа для текущего проекта с датами.",
  exampleLabel: "Спланировать этот проект",
  applyFailed:
    "Не удалось применить изменения. Проверьте предложение и повторите.",
  close: "Закрыть помощника",
  date: "Дата",
  kind: "Тип",
  parent: "Родительский проект",
  noChanges: "Изменения не внесены.",
  newChat: "Новый диалог",
  setup: "Настройка модели",
};
export const assistantLabel = (language: string) =>
  language === "ru" ? ru.title : en.title;
type ChatMessage = { role: "user" | "assistant"; content: string };
export default function Assistant({
  open,
  close,
  selected,
  projectName,
  refresh,
  openProject,
}: {
  open: boolean;
  close: () => void;
  selected: string | null;
  projectName: string | null;
  refresh: () => Promise<void>;
  openProject: (id: string) => void;
}) {
  const language = useLanguage();
  const copy = language === "ru" ? ru : en;
  const dialog = useRef<HTMLDialogElement>(null);
  const input = useRef<HTMLTextAreaElement>(null);
  const log = useRef<HTMLDivElement>(null);
  const pendingRequest = useRef<AbortController | null>(null);
  const operationLock = useRef(false);
  const [status, setStatus] = useState<AssistantStatus | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [plan, setPlan] = useState<AssistantPlan | null>(null);
  const [busy, setBusy] = useState<"plan" | "apply" | "discard" | null>(null);
  const [error, setError] = useState("");
  const [checking, setChecking] = useState(false);
  const [showSetup, setShowSetup] = useState(false);
  const [dictationOpen, setDictationOpen] = useState(false);
  const voicePrefix = draft && !draft.endsWith("\n") ? `${draft}\n` : draft;
  const voiceCapacity = Math.max(0, 6000 - voicePrefix.length);
  const configuring = setupRunning(status);
  const setupVisible = !!status && (!status.ready || showSetup || configuring);
  function explain(value: string) {
    const errors: Record<string, string> = {
      ai_unavailable: copy.unavailable,
      ai_model: copy.offline,
      ai_setup_model: copy.offline,
      ai_invalid: copy.invalid,
      ai_target: copy.target,
      ai_busy: copy.busy,
      ai_context: copy.contextLarge,
      ai_stale: copy.expired,
      ai_expired: copy.expired,
      ai_cancelled: copy.cancelled,
    };
    return errors[value] || value;
  }
  async function check() {
    setChecking(true);
    try {
      setStatus(await api.assistantStatus());
    } catch {
      setStatus({ ready: false, model: "qwen3.5:9b", error: "ai_unavailable" });
    } finally {
      setChecking(false);
    }
  }
  useEffect(() => {
    const el = dialog.current!;
    if (open) {
      el.showModal();
      input.current?.focus({ preventScroll: true });
    } else {
      el.close();
      pendingRequest.current?.abort();
      setDictationOpen(false);
    }
    return () => el.close();
  }, [open]);
  useEffect(() => {
    if (!open) return;
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout>;
    async function poll() {
      try {
        const next = await api.assistantStatus(controller.signal);
        if (!controller.signal.aborted) setStatus(next);
      } catch {
        if (!controller.signal.aborted)
          setStatus((previous) => ({ ...previous, ready: false, model: previous?.model || "qwen3.5:4b", error: "ai_unavailable" }));
      }
      if (!controller.signal.aborted) timer = setTimeout(poll, 1200);
    }
    void poll();
    return () => { controller.abort(); clearTimeout(timer); };
  }, [open]);
  useEffect(() => () => pendingRequest.current?.abort(), []);
  useEffect(() => {
    if (!plan?.id && busy !== "apply") return;
    const handler = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [plan, busy]);
  useEffect(() => {
    if (!log.current) return;
    const proposal = log.current.querySelector(".assistant-proposal");
    if (plan?.id && proposal) proposal.scrollIntoView({ block: "start" });
    else log.current.scrollTop = log.current.scrollHeight;
  }, [messages, plan, busy]);
  async function submit() {
    const message = draft.trim();
    if (!message || busy || operationLock.current || plan?.id || !status?.ready || configuring || dictationOpen)
      return;
    operationLock.current = true;
    const history = messages.slice(-8);
    setMessages((current) => [...current, { role: "user", content: message }]);
    setDraft("");
    setError("");
    setBusy("plan");
    const controller = new AbortController();
    pendingRequest.current = controller;
    const today = new Date();
    const date = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
    try {
      const next = await api.assistantPlan(
        { message, history, selected, date },
        controller.signal,
      );
      if (controller.signal.aborted) return;
      setPlan(next.id ? next : null);
      if (next.text && !next.id)
        setMessages((current) => [
          ...current,
          { role: "assistant", content: copy.noChanges + "\n\n" + next.text },
        ]);
      if (!next.text && !next.id) setError("ai_invalid");
    } catch (err) {
      if (controller.signal.aborted) {
        setError("ai_cancelled");
        setDraft(message);
      } else setError((err as Error).message);
    } finally {
      if (pendingRequest.current === controller) pendingRequest.current = null;
      operationLock.current = false;
      setBusy(null);
    }
  }
  async function apply() {
    if (!plan?.id || busy || operationLock.current) return;
    operationLock.current = true;
    setError("");
    setBusy("apply");
    try {
      const result = await api.assistantApply(plan.id);
      await refresh();
      setMessages((current) => [
        ...current,
        {
          role: "assistant",
          content:
            copy.applied +
            ":\n" +
            plan.operations
              .map(
                (operation) =>
                  operation.projectName + " — " + toolLabel(operation),
              )
              .join("\n"),
        },
      ]);
      setPlan(null);
      const navigation = [...result.operations]
        .reverse()
        .find((operation) => operation.tool === "open_project");
      if (navigation) {
        openProject(navigation.projectId);
        close();
      }
    } catch (err) {
      setError((err as Error).message || copy.applyFailed);
    } finally {
      operationLock.current = false;
      setBusy(null);
    }
  }
  async function discard() {
    if (!plan?.id || busy || operationLock.current) return;
    operationLock.current = true;
    setBusy("discard");
    setError("");
    try {
      await api.assistantDiscard(plan.id);
      setPlan(null);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      operationLock.current = false;
      setBusy(null);
    }
  }
  function toolLabel(operation: AssistantOperation) {
    if (operation.tool === "create_subproject") return t("Новый подпроект");
    if (operation.tool === "open_project") return t("Открыть проект");
    if (operation.tool === "create_project") return t("Создать проект");
    if (operation.tool === "update_project") return t("Редактировать");
    if (operation.tool === "add_link") return t("Добавить ссылку");
    return t(
      operation.changes.kind === "note" ? "Добавить заметку" : "Добавить этап",
    );
  }
  const fieldLabels: Record<string, string> = {
    name: t("Название"),
    parent: copy.parent,
    description: t("Описание"),
    category: t("Направление"),
    status: t("Статус проекта"),
    pinned: t("Закрепить"),
    date: copy.date,
    title: t("Название"),
    kind: copy.kind,
    url: t("Ссылка"),
  };
  function fieldValue(key: string, value: string | boolean | null) {
    if (value === null) return copy.root;
    if (typeof value === "boolean") return value ? copy.yes : copy.no;
    const labels: Record<string, string> = {
      planned: t("Запланирован"),
      in_progress: t("В работе"),
      paused: t("На паузе"),
      completed: t("Завершён"),
      start: t("Старт"),
      milestone: t("Этап"),
      deadline: t("Дедлайн"),
      note: t("Заметка"),
    };
    return key === "status" || key === "kind" ? labels[value] || value : value;
  }
  return (
    <><dialog
      ref={dialog}
      className="assistant-drawer"
      aria-label={copy.title}
      onCancel={(event) => {
        event.preventDefault();
        event.stopPropagation();
        close();
      }}
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          event.preventDefault();
          event.stopPropagation();
          close();
        }
      }}
    >
      <header className="assistant-heading">
        <div>
          <h2>
            <Bot size={20} />
            {copy.title}
          </h2>
          <p>{copy.subtitle}</p>
        </div>
        <div className="assistant-heading-actions">
          <button type="button" className="icon-button" aria-label={copy.setup}
            aria-pressed={setupVisible} disabled={!!busy || !!plan?.id || configuring || !status?.ready}
            onClick={() => setShowSetup((value) => !value)}>
            <Settings2 size={17} />
          </button>
          {!!messages.length && (
            <button
              type="button"
              className="icon-button"
              aria-label={copy.newChat}
              disabled={!!busy || !!plan?.id}
              onClick={() => {
                setMessages([]);
                setDraft("");
                setError("");
                input.current?.focus();
              }}
            >
              <MessageSquarePlus size={18} />
            </button>
          )}
          <button
            type="button"
            className="icon-button"
            aria-label={copy.close}
            onClick={close}
          >
            <X size={19} />
          </button>
        </div>
      </header>
      <div className="assistant-connection">
        <span data-ready={status?.ready}>
          {checking ? (
            <LoaderCircle size={13} className="spin" />
          ) : (
            <span className="assistant-status-dot" />
          )}
          {status?.model || "Ollama"}
        </span>
        <button
          type="button"
          className="icon-button"
          aria-label={copy.reconnect}
          disabled={checking}
          onClick={() => void check()}
        >
          <RefreshCw size={14} />
        </button>
      </div>
      <div className="assistant-context" title={projectName || copy.all}>
        {copy.context}: <strong>{projectName || copy.all}</strong>
      </div>
      <div
        ref={log}
        className="assistant-log"
        role="log"
        aria-live="polite"
        aria-relevant="additions"
      >
        {setupVisible && <AssistantSetup status={status!} update={setStatus} done={() => setShowSetup(false)} />}
        {!status && <div className="assistant-working" role="status"><LoaderCircle size={16} className="spin" />{copy.reconnect}</div>}
        {!setupVisible && status?.ready && !messages.length && (
          <div className="assistant-empty">
            <Bot size={32} />
            <h3>{copy.empty}</h3>
            <p>{copy.intro}</p>
            {selected && (
              <button
                type="button"
                className="button secondary"
                onClick={() => {
                  setDraft(copy.example);
                  input.current?.focus();
                }}
              >
                {copy.exampleLabel}
              </button>
            )}
          </div>
        )}
        {!setupVisible && messages.map((message, index) => (
          <div key={index} className={`assistant-message ${message.role}`}>
            <span>
              {message.role === "user"
                ? language === "ru"
                  ? "Вы"
                  : "You"
                : "ProjiSpace"}
            </span>
            <p>{message.content}</p>
          </div>
        ))}
        {busy === "plan" && (
          <div className="assistant-working" role="status">
            <LoaderCircle className="spin" size={16} />
            {copy.thinking}
          </div>
        )}
        {plan?.id && (
          <section className="assistant-proposal" aria-label={copy.review}>
            <h3>
              {copy.review} <span>{plan.operations.length}</span>
            </h3>
            {plan.operations.map((operation, index) => (
              <article className="assistant-operation" key={index}>
                <h4>{toolLabel(operation)}</h4>
                <p className="assistant-target">{operation.projectName}</p>
                <dl>
                  {Object.entries(operation.changes).map(([key, value]) => (
                    <div key={key}>
                      <dt>{fieldLabels[key] || key}</dt>
                      <dd>
                        {operation.before &&
                          operation.before[key] !== value && (
                            <del title={copy.previous}>
                              {fieldValue(key, operation.before[key])}
                            </del>
                          )}
                        <span>{fieldValue(key, value)}</span>
                      </dd>
                    </div>
                  ))}
                </dl>
              </article>
            ))}
            <div className="assistant-review-actions">
              <button
                type="button"
                className="button secondary"
                disabled={!!busy}
                onClick={() => void discard()}
              >
                {copy.discard}
              </button>
              <button
                type="button"
                className="button primary"
                disabled={!!busy}
                onClick={() => void apply()}
              >
                {busy === "apply" ? (
                  <LoaderCircle className="spin" size={15} />
                ) : (
                  <Check size={15} />
                )}{" "}
                {copy.apply}
              </button>
            </div>
          </section>
        )}
      </div>
      {error && (
        <p className="assistant-error" role="alert">
          {explain(error)}
        </p>
      )}
      {!setupVisible && <form
        className="assistant-composer"
        onSubmit={(event) => {
          event.preventDefault();
          void submit();
        }}
      >
        <textarea
          ref={input}
          aria-label={copy.message}
          placeholder={copy.placeholder}
          maxLength={6000}
          value={draft}
          disabled={!!busy || !!plan?.id}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            if (
              event.key === "Enter" &&
              !event.shiftKey &&
              !event.nativeEvent.isComposing
            ) {
              event.preventDefault();
              void submit();
            }
          }}
        />
        <div className="assistant-composer-actions">
        <button
          type="button"
          className="button secondary assistant-dictation"
          aria-label={t("Голосовой ввод")}
          title={t("Голосовой ввод")}
          disabled={!!busy || !!plan?.id || configuring || voiceCapacity === 0}
          onClick={() => setDictationOpen(true)}
        >
          <Mic size={17} />
        </button>
        {busy === "plan" ? (
          <button
            type="button"
            className="button secondary"
            aria-label={copy.stop}
            onClick={(event) => {
              event.preventDefault();
              pendingRequest.current?.abort();
            }}
          >
            <Square size={16} />
          </button>
        ) : (
          <button
            type="button"
            className="button primary"
            aria-label={copy.send}
            onClick={(event) => {
              event.preventDefault();
              void submit();
            }}
            disabled={!draft.trim() || !!busy || !!plan?.id || !status?.ready || configuring}
          >
            <Send size={17} />
          </button>
        )}
        </div>
      </form>}
    </dialog>
    {open && dictationOpen && <VoiceDictation
      close={() => {
        setDictationOpen(false);
        requestAnimationFrame(() => input.current?.focus({ preventScroll: true }));
      }}
      maxLength={voiceCapacity}
      insert={(value) => {
        const next = voicePrefix + value;
        setDraft(next);
        setDictationOpen(false);
        requestAnimationFrame(() => {
          input.current?.focus({ preventScroll: true });
          input.current?.setSelectionRange(next.length, next.length);
        });
      }}
    />}
    </>
  );
}
