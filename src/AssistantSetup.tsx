import { Fragment, useEffect, useRef, useState } from "react";
import { Check, ChevronRight, Download, HardDrive, LoaderCircle, Play, X } from "lucide-react";
import { api } from "./api";
import { useLanguage } from "./i18n";
import type { AssistantStatus } from "./types";

const en = {
  title: "Set up your assistant",
  intro: "Two steps, no terminal. Downloads need an internet connection; your assistant then works locally.",
  runtime: "Ollama runtime",
  runtimeHint: "Runs the AI model on this computer.",
  runtimeSize: "Official Windows installer · allow at least 4 GB for Ollama",
  installed: "Installed",
  running: "Running",
  install: "Install Ollama",
  start: "Start Ollama",
  model: "Choose a model",
  compact: "Compact",
  compactHint: "A smaller download for everyday project tasks.",
  powerful: "More capable",
  powerfulHint: "Better suited to longer, more detailed requests.",
  compactMemory: "16 GB RAM suggested",
  powerfulMemory: "24 GB RAM suggested",
  download: "Download model",
  use: "Use this model",
  current: "In use",
  local: "Models stay in Ollama’s local storage and can be shared with other apps. Speed depends on your computer.",
  resume: "Download stopped. Start again to continue from the saved parts.",
  cancel: "Cancel download",
  done: "Back to assistant",
  starting: "Starting Ollama…",
  downloading_runtime: "Downloading Ollama…",
  verifying: "Checking the installer’s signature…",
  installing: "Installing Ollama…",
  downloading_model: "Downloading model…",
  checking: "Checking model readiness…",
  waitInstall: "Let installation finish before closing ProjiSpace.",
  unsupported: "Automatic installation is available in the Windows app.",
  official: "Download Ollama",
  retry: "Try again",
  failed: "Setup did not finish. Check your connection and available disk space, then try again.",
  signature: "The installer’s signature could not be verified. It was not run. Try downloading again.",
  unavailable: "Ollama did not respond. Try starting it again.",
  busy: "Another operation is running. Please wait for it to finish.",
  invalid: "This model could not be verified for use with the assistant.",
  yourModels: "Your Ollama models",
  noTools: "Does not support assistant tools",
  remote: "Cloud model · this assistant works locally",
  notVerified: "Could not check this model",
  settings: "Model settings",
  scanned: "Models from your Ollama installation. The list updates automatically.",
  available: "Available to download",
};
const ru: typeof en = {
  title: "Настроить помощника",
  intro: "Два шага, без командной строки. Для загрузки нужен интернет; затем помощник работает локально.",
  runtime: "Компонент Ollama",
  runtimeHint: "Запускает AI-модель на этом компьютере.",
  runtimeSize: "Официальный установщик Windows · отведите от 4 ГБ для Ollama",
  installed: "Установлена",
  running: "Работает",
  install: "Установить Ollama",
  start: "Запустить Ollama",
  model: "Выберите модель",
  compact: "Компактная",
  compactHint: "Меньше загрузка, для повседневных задач с проектами.",
  powerful: "Более мощная",
  powerfulHint: "Для более подробных и сложных запросов.",
  compactMemory: "Рекомендуется 16 ГБ ОЗУ",
  powerfulMemory: "Рекомендуется 24 ГБ ОЗУ",
  download: "Скачать модель",
  use: "Использовать модель",
  current: "Используется",
  local: "Модели хранятся локально в Ollama и доступны другим приложениям. Скорость зависит от компьютера.",
  resume: "Загрузка остановлена. Запустите её снова, чтобы продолжить с сохранённых частей.",
  cancel: "Отменить загрузку",
  done: "Перейти к помощнику",
  starting: "Запускаем Ollama…",
  downloading_runtime: "Загружаем Ollama…",
  verifying: "Проверяем подпись установщика…",
  installing: "Устанавливаем Ollama…",
  downloading_model: "Загружаем модель…",
  checking: "Проверяем готовность модели…",
  waitInstall: "Дождитесь конца установки перед закрытием ProjiSpace.",
  unsupported: "Автоматическая установка доступна в приложении для Windows.",
  official: "Скачать Ollama",
  retry: "Повторить",
  failed: "Не удалось завершить настройку. Проверьте интернет и свободное место, затем повторите.",
  signature: "Не удалось проверить подпись установщика. Он не был запущен. Повторите загрузку.",
  unavailable: "Ollama не отвечает. Попробуйте запустить её ещё раз.",
  busy: "Другая операция ещё выполняется. Дождитесь её завершения.",
  invalid: "Не удалось проверить совместимость модели с помощником.",
  yourModels: "Ваши модели Ollama",
  noTools: "Не поддерживает инструменты помощника",
  remote: "Облачная модель · помощник работает локально",
  notVerified: "Не удалось проверить модель",
  settings: "Настройки модели",
  scanned: "Модели из вашей Ollama. Список обновляется автоматически.",
  available: "Можно скачать",
};

export function setupRunning(status: AssistantStatus | null) {
  return !!status?.task && !["cancelled", "error", "complete"].includes(status.task.phase);
}
function bytes(value: number) {
  return value >= 1e9 ? `${(value / 1e9).toFixed(1)} GB` : `${Math.round(value / 1e6)} MB`;
}
export default function AssistantSetup({ status, update, done }: {
  status: AssistantStatus;
  update: (status: AssistantStatus) => void;
  done: () => void;
}) {
  const language = useLanguage();
  const copy = language === "ru" ? ru : en;
  const [choice, setChoice] = useState(status.model);
  const [requesting, setRequesting] = useState(false);
  const [error, setError] = useState("");
  const lock = useRef(false);
  const working = setupRunning(status);
  const task = status.task;
  const models = status.models || [];
  const rows = [...models].sort((a, b) => Number(b.installed) - Number(a.installed) || Number(b.supported) - Number(a.supported));
  const selected = models.find((model) => model.id === choice);
  const focusChoice = models.some(model => model.id === choice && model.supported) ? choice : models.find(model => model.supported)?.id;
  useEffect(() => { setChoice(status.model); }, [status.model]);
  useEffect(() => {
    if (task?.phase !== "installing") return;
    const handler = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [task?.phase]);
  async function act(action: "runtime" | "model" | "select" | "cancel") {
    if (lock.current) return;
    lock.current = true;
    setRequesting(true);
    setError("");
    try {
      const next = action === "cancel" ? await api.assistantSetupCancel()
        : action === "select" ? await api.assistantModel(choice)
          : await api.assistantSetup(action, action === "model" ? choice : undefined);
      update(next);
    } catch (err) { setError((err as Error).message); }
    finally { lock.current = false; setRequesting(false); }
  }
  const errors: Record<string, string> = {
    ai_signature: copy.signature, ai_setup_signature: copy.signature,
    ai_unavailable: copy.unavailable, ai_busy: copy.busy,
    ai_model: copy.invalid, ai_invalid: copy.invalid,
    ai_setup_busy: copy.busy, ai_setup_model: copy.invalid,
    ai_setup_unavailable: copy.unavailable,
  };
  const failure = error || (task?.phase === "error" ? task.error || "ai_setup" : "");
  const percent = task?.total ? Math.min(100, Math.floor(task.completed / task.total * 100)) : null;
  return (
    <section className="assistant-setup" data-configured={status.ready} aria-label={status.ready ? copy.settings : copy.title}>
      <h3>{status.ready ? copy.settings : copy.title}</h3>
      <p className="assistant-setup-intro">{status.ready ? copy.scanned : copy.intro}</p>
      {!status.ready && <div className="assistant-setup-step">
        <span className="assistant-step-number" data-done={status.runtime?.running}>
          {status.runtime?.running ? <Check size={14} /> : "1"}
        </span>
        <div>
          <h4>{copy.runtime} {status.runtime?.running && <small>{copy.running}</small>}</h4>
          <p>{copy.runtimeHint}</p>
          {!status.runtime?.running && <>
            {!status.runtime?.installed && <p className="assistant-setup-size">{copy.runtimeSize}</p>}
            {status.runtime?.canInstall || status.runtime?.installed ? (
              <button type="button" className="button secondary" disabled={working || requesting} onClick={() => void act("runtime")}>
                {status.runtime?.installed ? <Play size={14} /> : <Download size={14} />}
                {status.runtime?.installed ? copy.start : copy.install}
              </button>
            ) : <p>{copy.unsupported} <a href="https://ollama.com/download/windows" target="_blank" rel="noreferrer">{copy.official}</a></p>}
          </>}
        </div>
      </div>}
      <div className="assistant-setup-step assistant-model-step">
        {!status.ready && <span className="assistant-step-number">2</span>}
        <div>
          <h4>{models.some(model => model.installed) ? copy.yourModels : copy.model}
            {selected?.installed && selected.supported && (choice !== status.model || !status.ready) && <button type="button" className="button primary" disabled={working || requesting} onClick={() => void act("select")}><Check size={13} />{copy.use}</button>}
          </h4>
          <div className="assistant-model-options" role="radiogroup" aria-label={copy.model}>
            {rows.map((model, index) => (
              <Fragment key={model.id}>
              {!model.installed && rows[index - 1]?.installed && <h5 className="assistant-models-heading">{copy.available}</h5>}
              <button type="button" role="radio" aria-checked={choice === model.id} tabIndex={focusChoice === model.id ? 0 : -1} disabled={working || requesting || !model.supported}
                className="assistant-model-option" onClick={() => setChoice(model.id)}
                onKeyDown={(event) => {
                  if (!["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(event.key)) return;
                  event.preventDefault();
                  const available = rows.filter(item => item.supported);
                  const current = available.findIndex(item => item.id === model.id);
                  const next = available[(current + (["ArrowUp", "ArrowLeft"].includes(event.key) ? available.length - 1 : 1)) % available.length];
                  setChoice(next.id);
                  const buttons = event.currentTarget.parentElement?.querySelectorAll<HTMLButtonElement>('[role="radio"]');
                  buttons?.[rows.findIndex(item => item.id === next.id)]?.focus();
                }}>
                <span className="assistant-model-radio">{choice === model.id && <span />}</span>
                <span className="assistant-model-description">
                  <strong>{!model.installed ? model.id === "qwen3.5:4b" ? copy.compact : copy.powerful : model.id}{!model.installed && <span>{model.id}</span>}</strong>
                  {(!model.supported || !model.installed) && <span>{!model.supported ? model.reason === "remote" ? copy.remote : model.reason === "tools" ? copy.noTools : copy.notVerified : model.id === "qwen3.5:4b" ? copy.compactHint : copy.powerfulHint}</span>}
                  {model.sizeBytes > 0 && <small><HardDrive size={11} /> {bytes(model.sizeBytes)}{!model.installed && <><span>·</span>{model.id === "qwen3.5:4b" ? copy.compactMemory : copy.powerfulMemory}</>}</small>}
                  {model.installed && model.supported && <em><Check size={11} />{model.id === status.model && status.ready ? copy.current : copy.installed}</em>}
                </span>
              </button>
              </Fragment>
            ))}
          </div>
          {!working && selected && !selected.installed && (
            <button type="button" className="button primary assistant-setup-download" disabled={!status.runtime?.running || requesting || !selected.supported}
              onClick={() => void act(selected.installed ? "select" : "model")}>
              {requesting ? <LoaderCircle size={14} className="spin" /> : selected.installed ? <Check size={14} /> : <Download size={14} />}
              {selected.installed ? copy.use : copy.download}
            </button>
          )}
        </div>
      </div>
      {working && task && (
        <div className="assistant-setup-progress" role="status" aria-live="polite">
          <div><LoaderCircle size={15} className="spin" /><strong>{copy[task.phase as "starting"]}</strong>
            {task.cancellable && <button type="button" className="icon-button" aria-label={copy.cancel} disabled={requesting} onClick={() => void act("cancel")}><X size={16} /></button>}
          </div>
          <progress max={100} value={percent ?? undefined} aria-label={copy[task.phase as "starting"]} />
          <p>{percent !== null ? `${percent}% · ${bytes(task.completed)} / ${bytes(task.total)}` : task.phase === "installing" ? copy.waitInstall : task.model || "Ollama"}</p>
        </div>
      )}
      {task?.phase === "cancelled" && <p className="assistant-setup-hint" role="status">{copy.resume}</p>}
      {failure && <p className="assistant-error" role="alert">{errors[failure] || copy.failed}</p>}
      <p className="assistant-setup-hint">{copy.local}</p>
      {status.ready && !working && <button type="button" className="button secondary assistant-setup-done" onClick={done}>{copy.done}<ChevronRight size={14} /></button>}
    </section>
  );
}
