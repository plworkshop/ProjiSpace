import { useEffect, useRef, useState } from "react";
import {
  Download,
  Mic,
  Square,
  LoaderCircle,
  ArrowDownLeft,
} from "lucide-react";
import { Modal } from "./ui";
import { t, useLanguage } from "./i18n";
import { encodeVoiceWav } from "./audio";
import "./VoiceDictation.css";

type Setup = {
  supported: boolean;
  ready: boolean;
  phase: string;
  received: number;
  total: number;
  busy: boolean;
  error: string | null;
};
export default function VoiceDictation({
  close,
  insert,
  maxLength = 100000,
}: {
  close: () => void;
  insert: (text: string) => void;
  maxLength?: number;
}) {
  const interfaceLanguage = useLanguage();
  const [setup, setSetup] = useState<Setup | null>(null);
  const [phase, setPhase] = useState<
    "idle" | "requesting" | "recording" | "transcribing" | "preview"
  >("idle");
  const [text, setText] = useState("");
  const [seconds, setSeconds] = useState(0);
  const [language, setLanguage] = useState("auto");
  const [error, setError] = useState("");
  const [level, setLevel] = useState(0);
  const stream = useRef<MediaStream | null>(null);
  const context = useRef<AudioContext | null>(null);
  const recorder = useRef<MediaRecorder | null>(null);
  const request = useRef<AbortController | null>(null);
  const alive = useRef(true);
  const recordingTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const stopRecording = () => {
    if (recorder.current?.state === "recording") recorder.current.stop();
    stream.current?.getTracks().forEach((track) => track.stop());
    if (recordingTimer.current) clearInterval(recordingTimer.current);
  };
  useEffect(() => {
    alive.current = true;
    const controller = new AbortController();
    let polling = false;
    const update = async () => {
      if (polling) return;
      polling = true;
      try {
        const response = await fetch("/api/dictation", {
          signal: controller.signal,
        });
        if (!response.ok) throw new Error();
        const status: Setup = await response.json();
        if (alive.current) setSetup(status);
      } catch {
        if (!controller.signal.aborted)
          setError(t("Не удалось загрузить голосовой ввод."));
      } finally {
        polling = false;
      }
    };
    void update();
    const timer = setInterval(() => void update(), 1000);
    return () => {
      alive.current = false;
      controller.abort();
      clearInterval(timer);
      request.current?.abort();
      stopRecording();
      void context.current?.close().catch(() => {});
    };
  }, []);
  useEffect(() => {
    if (phase === "idle") return;
    const prevent = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener("beforeunload", prevent);
    return () => window.removeEventListener("beforeunload", prevent);
  }, [phase]);

  async function setupModel(cancel = false) {
    setError("");
    let message = t("Не удалось скачать модель. Попробуйте ещё раз.");
    try {
      const response = await fetch("/api/dictation/model", {
        method: cancel ? "DELETE" : "POST",
      });
      const body = await response.json();
      if (!response.ok) {
        message = t(body.error);
        throw new Error(message);
      }
      if (alive.current) setSetup(body);
    } catch {
      if (alive.current) setError(message);
    }
  }
  async function transcribe(blob: Blob, recordingContext: AudioContext) {
    if (!alive.current) return;
    setPhase("transcribing");
    setLevel(0);
    const controller = new AbortController();
    request.current = controller;
    let message = t("Не удалось распознать запись.");
    try {
      const audio = await recordingContext.decodeAudioData(
        await blob.arrayBuffer(),
      );
      const samples = new Float32Array(Math.min(audio.length, 16000 * 120));
      for (let channel = 0; channel < audio.numberOfChannels; channel++) {
        const data = audio.getChannelData(channel);
        for (let i = 0; i < samples.length; i++)
          samples[i] += data[i] / audio.numberOfChannels;
      }
      await recordingContext.close();
      if (controller.signal.aborted || !alive.current) return;
      const response = await fetch(
        `/api/dictation/transcribe?language=${language}`,
        {
          method: "POST",
          headers: { "Content-Type": "audio/wav" },
          body: encodeVoiceWav(samples),
          signal: controller.signal,
        },
      );
      const result = await response.json();
      if (!response.ok) {
        message = t(result.error);
        throw new Error(message);
      }
      if (alive.current) {
        setText(result.text);
        setPhase("preview");
      }
    } catch {
      if (!controller.signal.aborted && alive.current) {
        setError(message);
        setPhase("idle");
      }
    } finally {
      void recordingContext.close().catch(() => {});
    }
  }
  async function start() {
    if (phase !== "idle" || !setup?.ready || setup.busy) return;
    setError("");
    setPhase("requesting");
    setSeconds(0);
    try {
      const input = await navigator.mediaDevices.getUserMedia({
        audio: {
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: true,
        },
        video: false,
      });
      if (!alive.current) {
        input.getTracks().forEach((track) => track.stop());
        return;
      }
      stream.current = input;
      const recordingContext = new AudioContext({ sampleRate: 16000 });
      context.current = recordingContext;
      await recordingContext.resume();
      if (!alive.current) {
        input.getTracks().forEach((track) => track.stop());
        await recordingContext.close();
        return;
      }
      const analyser = recordingContext.createAnalyser();
      analyser.fftSize = 256;
      recordingContext.createMediaStreamSource(input).connect(analyser);
      const data = new Uint8Array(analyser.fftSize);
      const recording = new MediaRecorder(input);
      recorder.current = recording;
      const chunks: Blob[] = [];
      let failed = false;
      recording.ondataavailable = (event) => {
        if (event.data.size) chunks.push(event.data);
      };
      recording.onstop = () => {
        input.getTracks().forEach((track) => track.stop());
        if (recordingTimer.current) clearInterval(recordingTimer.current);
        if (alive.current && !failed)
          void transcribe(
            new Blob(chunks, { type: recording.mimeType }),
            recordingContext,
          );
        else void recordingContext.close().catch(() => {});
      };
      recording.onerror = () => {
        failed = true;
        stopRecording();
        if (alive.current) {
          setError(t("Не удалось записать звук. Проверьте микрофон."));
          setPhase("idle");
        }
      };
      recording.start(250);
      setPhase("recording");
      const started = performance.now();
      recordingTimer.current = setInterval(() => {
        if (!alive.current) return;
        const elapsed = Math.floor((performance.now() - started) / 1000);
        setSeconds(Math.min(elapsed, 120));
        analyser.getByteTimeDomainData(data);
        setLevel(
          Math.min(
            1,
            Math.sqrt(
              data.reduce((sum, value) => sum + ((value - 128) / 128) ** 2, 0) /
                data.length,
            ) * 5,
          ),
        );
        if (elapsed >= 120) stopRecording();
      }, 100);
    } catch {
      stopRecording();
      void context.current?.close().catch(() => {});
      if (alive.current) {
        setPhase("idle");
        setError(t("Не удалось записать звук. Проверьте микрофон."));
      }
    }
  }
  const downloading = setup?.phase === "downloading";
  return (
    <Modal title={t("Голосовой ввод")} close={close} className="voice-modal">
      {!setup ? (
        <div className="voice-status">
          <LoaderCircle className="spin" size={20} />
        </div>
      ) : !setup.supported ? (
        <p>{t("Локальный движок недоступен. Переустановите ProjiSpace.")}</p>
      ) : !setup.ready ? (
        <div className="voice-setup">
          <p>
            {t(
              "Для диктовки нужна языковая модель. Загрузка потребуется один раз.",
            )}
          </p>
          {downloading ? (
            <>
              <progress
                max={setup.total || 1}
                value={setup.received}
                aria-label={t("Загрузка модели")}
              />
              <span className="voice-progress">
                {Math.round(setup.received / 1e6)} /{" "}
                {Math.round(setup.total / 1e6)} MB
              </span>
              <button
                type="button"
                className="button secondary"
                onClick={() => void setupModel(true)}
              >
                {t("Отмена")}
              </button>
            </>
          ) : (
            <button
              type="button"
              className="button primary"
              onClick={() => void setupModel()}
            >
              <Download size={16} />
              {t("Скачать модель · 148 МБ")}
            </button>
          )}
        </div>
      ) : (
        <>
          {phase === "idle" && (
            <>
              <label className="voice-language">
                {t("Язык речи")}
                <select
                  value={language}
                  onChange={(e) => setLanguage(e.target.value)}
                >
                  <option value="auto">{t("Определить автоматически")}</option>
                  <option value="ru">Русский</option>
                  <option value="en">English</option>
                </select>
              </label>
              <button
                type="button"
                className="button primary voice-start"
                disabled={setup.busy}
                onClick={() => void start()}
              >
                <Mic size={17} />
                {t("Начать запись")}
              </button>
              <p className="field-hint">{t("До 2 минут за одну запись.")}</p>
            </>
          )}
          {phase === "requesting" && (
            <p className="voice-status">
              <LoaderCircle className="spin" size={18} />
              {t("Разрешите доступ к микрофону.")}
            </p>
          )}
          {phase === "recording" && (
            <div className="voice-recording">
              <div className="voice-meter" aria-hidden="true">
                <span
                  style={{ transform: `scaleX(${Math.max(0.02, level)})` }}
                />
              </div>
              <span className="voice-time" role="timer">
                {Math.floor(seconds / 60)}:
                {String(seconds % 60).padStart(2, "0")} / 2:00
              </span>
              <button
                type="button"
                className="button primary"
                onClick={stopRecording}
              >
                <Square size={15} />
                {t("Остановить запись")}
              </button>
              <button type="button" className="text-button" onClick={close}>
                {t("Отмена")}
              </button>
            </div>
          )}
          {phase === "transcribing" && (
            <div>
              <p className="voice-status" role="status">
                <LoaderCircle className="spin" size={20} />
                {t("Распознаём…")}
              </p>
              <button
                type="button"
                className="button secondary"
                onClick={close}
              >
                {t("Отмена")}
              </button>
            </div>
          )}
          {phase === "preview" && (
            <>
              <textarea
                className="voice-preview"
                aria-label={t("Распознанный текст")}
                dir="auto"
                value={text}
                maxLength={maxLength}
                onChange={(e) => setText(e.target.value)}
              />
              {text.trim().length > maxLength && <p className="error" role="alert">
                {interfaceLanguage === "ru"
                  ? `Для вставки осталось ${maxLength} символов. Сократите распознанный текст.`
                  : `${maxLength} characters are available. Shorten the transcription before inserting it.`}
              </p>}
              <div className="voice-actions">
                <button
                  type="button"
                  className="button secondary"
                  onClick={() => {
                    setText("");
                    setPhase("idle");
                  }}
                >
                  {t("Записать ещё")}
                </button>
                <button
                  type="button"
                  className="button primary"
                  disabled={!text.trim() || text.trim().length > maxLength}
                  onClick={() => insert(text.trim())}
                >
                  <ArrowDownLeft size={16} />
                  {t("Вставить текст")}
                </button>
              </div>
            </>
          )}
        </>
      )}
      {(error || setup?.error) && (
        <p className="error" role="alert">
          {error || t(setup!.error!)}
        </p>
      )}
      {error ===
        t(
          "Для голосового ввода нужен Microsoft Visual C++ Redistributable x64.",
        ) && (
        <a
          className="text-button"
          href="https://learn.microsoft.com/en-us/cpp/windows/latest-supported-vc-redist"
          target="_blank"
          rel="noopener noreferrer"
        >
          {t("Открыть страницу Microsoft")}
        </a>
      )}
    </Modal>
  );
}
