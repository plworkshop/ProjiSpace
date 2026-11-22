import { t, getLanguage } from "./i18n";
import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ZoomIn, ZoomOut, Scan } from "lucide-react";
import { motion, useReducedMotion } from "motion/react";
import { IconButton } from "./ui";
import { api } from "./api";
import { imagePoint, markPath } from "./annotations";
import type { ImageMark, MarkTool } from "./annotations";
import ImageMarkupToolbar from "./ImageMarkupToolbar";
import "./ImageMarkup.css";

const Mark = memo(function Mark({ mark, width, height }: { mark: ImageMark; width: number; height: number }) {
  return <path d={markPath(mark, width, height)} fill="none" stroke={mark.color}
    strokeWidth={mark.width * width * (mark.tool === "marker" ? 5 : 1)}
    opacity={mark.tool === "marker" ? 0.3 : 1} strokeLinecap="round" strokeLinejoin="round" />;
});

export default function ImageViewer({
  src,
  title,
  referenceId,
  onDirtyChange,
  onSavingChange,
}: {
  src: string;
  title: string;
  referenceId: string;
  onDirtyChange: (dirty: boolean) => void;
  onSavingChange: (saving: boolean) => void;
}) {
  const en = getLanguage() === "en";
  const [tool, setTool] = useState<MarkTool | "pan">("pan");
  const [color, setColor] = useState("#ed5268");
  const [thickness, setThickness] = useState(3);
  const [history, setHistory] = useState<ImageMark[][]>([[]]);
  const [step, setStep] = useState(0);
  const [saved, setSaved] = useState("[]");
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [stroke, setStroke] = useState<ImageMark | null>(null);
  const activeStroke = useRef<{ pointer: number; mark: ImageMark } | null>(null);
  const marks = history[step];
  const serialized = useMemo(() => JSON.stringify(marks), [marks]);
  const dirty = serialized !== saved;
  const drawing = !!stroke;
  useEffect(() => {
    const controller = new AbortController();
    api.annotations(referenceId, controller.signal).then(value => {
      setHistory([value]); setStep(0); setSaved(JSON.stringify(value)); setLoaded(true);
    }).catch(reason => { if (!controller.signal.aborted) setError(reason.message); });
    return () => controller.abort();
  }, [referenceId]);
  useEffect(() => {
    onDirtyChange(dirty || saving || drawing);
    return () => onDirtyChange(false);
  }, [dirty, saving, drawing, onDirtyChange]);
  useEffect(() => {
    onSavingChange(saving);
    return () => onSavingChange(false);
  }, [saving, onSavingChange]);
  function commit(next: ImageMark[]) {
    setHistory(current => [...current.slice(Math.max(0, step - 99), step + 1), next]);
    setStep(Math.min(step + 1, 100));
    setError("");
  }
  async function save() {
    if (!dirty || saving || stroke) return;
    setSaving(true); setError("");
    try { await api.saveAnnotations(referenceId, marks); setSaved(JSON.stringify(marks)); }
    catch (reason) { setError((reason as Error).message); }
    finally { setSaving(false); }
  }
  const reduced = useReducedMotion();
  const viewport = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });
  const [natural, setNatural] = useState({ width: 0, height: 0 });
  const [view, setView] = useState({ scale: 1, x: 0, y: 0 });
  const [panning, setPanning] = useState(false);
  const pointer = useRef<{ id: number; x: number; y: number } | null>(null);
  const fit = natural.width
    ? Math.min(size.width / natural.width, size.height / natural.height, 1)
    : 0;
  const width = natural.width * fit;
  const height = natural.height * fit;
  const constrain = useCallback(
    (next: typeof view) => {
      const maxX = Math.max(0, (width * next.scale - size.width) / 2);
      const maxY = Math.max(0, (height * next.scale - size.height) / 2);
      return {
        ...next,
        x: Math.max(-maxX, Math.min(maxX, next.x)),
        y: Math.max(-maxY, Math.min(maxY, next.y)),
      };
    },
    [width, height, size],
  );
  const zoom = useCallback(
    (factor: number, x = 0, y = 0) => {
      setView((current) => {
        const scale = Math.max(1, Math.min(4, current.scale * factor));
        const ratio = scale / current.scale;
        return constrain({
          scale,
          x: x - (x - current.x) * ratio,
          y: y - (y - current.y) * ratio,
        });
      });
    },
    [constrain],
  );
  const reset = () => setView({ scale: 1, x: 0, y: 0 });
  useEffect(() => {
    const el = viewport.current!;
    const observer = new ResizeObserver(() =>
      setSize({ width: el.clientWidth, height: el.clientHeight }),
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  useEffect(() => {
    setView((current) => constrain(current));
  }, [constrain]);
  useEffect(() => {
    const el = viewport.current!;
    function wheel(event: WheelEvent) {
      event.preventDefault();
      if (activeStroke.current) return;
      const box = el.getBoundingClientRect();
      zoom(
        Math.exp(-event.deltaY * 0.002),
        event.clientX - box.left - box.width / 2,
        event.clientY - box.top - box.height / 2,
      );
    }
    el.addEventListener("wheel", wheel, { passive: false });
    return () => el.removeEventListener("wheel", wheel);
  }, [zoom]);
  return (
    <div className="image-viewer">
      <div
        className="image-zoom-toolbar"
        role="toolbar"
        aria-label={t("Масштаб изображения")}
      >
        <IconButton
          label={t("Уменьшить")}
          disabled={view.scale <= 1}
          onClick={() => zoom(1 / 1.25)}
        >
          <ZoomOut size={18} />
        </IconButton>
        <output aria-live="polite" aria-label={t("Текущий масштаб")}>
          {Number(view.scale.toFixed(2)).toLocaleString(getLanguage())}×
        </output>
        <IconButton
          label={t("Увеличить")}
          disabled={view.scale >= 4}
          onClick={() => zoom(1.25)}
        >
          <ZoomIn size={18} />
        </IconButton>
        <button
          type="button"
          className="button secondary small"
          onClick={reset}
        >
          <Scan size={15} /> {t("Вписать")}{" "}
        </button>
      </div>
      <ImageMarkupToolbar tool={tool} setTool={setTool} color={color} setColor={setColor}
        thickness={thickness} setThickness={setThickness} loaded={loaded} dirty={dirty} saving={saving}
        disabled={!loaded || saving || drawing} canUndo={step > 0} canRedo={step < history.length - 1} canClear={marks.length > 0}
        undo={() => setStep(step - 1)} redo={() => setStep(step + 1)} clear={() => commit([])} save={() => void save()} />
      {error && <p className="error" role="alert">{error}</p>}
      <div
        ref={viewport}
        className={`image-viewport ${view.scale > 1 ? "zoomed" : ""} ${panning ? "panning" : ""}`}
        tabIndex={0}
        role="region"
        aria-label={t(
          "Изображение: колесо меняет масштаб, стрелки перемещают, 0 — вписать",
        )}
        onDoubleClick={() => { if (tool === "pan") view.scale > 1 ? reset() : zoom(2); }}
        onKeyDown={(event) => {
          if (
            [
              "+",
              "=",
              "-",
              "0",
              "ArrowLeft",
              "ArrowRight",
              "ArrowUp",
              "ArrowDown",
            ].includes(event.key)
          )
            event.preventDefault();
          if (event.key === "+" || event.key === "=") zoom(1.25);
          if (event.key === "-") zoom(1 / 1.25);
          if (event.key === "0") reset();
          if (event.key.startsWith("Arrow"))
            setView((current) =>
              constrain({
                ...current,
                x:
                  current.x +
                  (event.key === "ArrowLeft"
                    ? 40
                    : event.key === "ArrowRight"
                      ? -40
                      : 0),
                y:
                  current.y +
                  (event.key === "ArrowUp"
                    ? 40
                    : event.key === "ArrowDown"
                      ? -40
                      : 0),
              }),
            );
        }}
        onPointerDown={(event) => {
          if (tool !== "pan" || view.scale <= 1 || event.button !== 0) return;
          event.preventDefault();
          event.currentTarget.focus();
          event.currentTarget.setPointerCapture(event.pointerId);
          pointer.current = {
            id: event.pointerId,
            x: event.clientX,
            y: event.clientY,
          };
          setPanning(true);
        }}
        onPointerMove={(event) => {
          const previous = pointer.current;
          if (!previous || previous.id !== event.pointerId) return;
          const dx = event.clientX - previous.x,
            dy = event.clientY - previous.y;
          pointer.current = {
            id: event.pointerId,
            x: event.clientX,
            y: event.clientY,
          };
          setView((current) =>
            constrain({ ...current, x: current.x + dx, y: current.y + dy }),
          );
        }}
        onPointerUp={(event) => {
          if (event.currentTarget.hasPointerCapture(event.pointerId))
            event.currentTarget.releasePointerCapture(event.pointerId);
        }}
        onLostPointerCapture={() => {
          pointer.current = null;
          setPanning(false);
        }}
      >
        <motion.div
          className="image-markup-surface"
          style={{ width, height, marginLeft: -width / 2, marginTop: -height / 2 }}
          initial={false}
          animate={{ x: view.x, y: view.y, scale: view.scale }}
          transition={{
            type: "spring", stiffness: 300, damping: 36, mass: 0.7,
            ...(reduced ? { duration: 0, type: "tween" } : {}),
            ...(panning ? { x: { duration: 0 }, y: { duration: 0 } } : {}),
          }}
        >
        <img
          src={src}
          alt={title}
          draggable={false}
          onLoad={(event) =>
            setNatural({
              width: event.currentTarget.naturalWidth,
              height: event.currentTarget.naturalHeight,
            })
          }
        />
        {natural.width > 0 && <svg className="image-markup-layer" viewBox={`0 0 ${natural.width} ${natural.height}`}
          data-drawing={tool !== "pan"} aria-label={en ? "Drawing area" : "Область рисования"}
          onPointerDown={event => {
            if (tool === "pan" || !loaded || saving || activeStroke.current || event.button !== 0) return;
            event.preventDefault(); event.stopPropagation();
            if (marks.length >= 500 || marks.reduce((count, mark) => count + mark.points.length, 0) >= 15000) {
              setError(en ? "Markup limit reached. Undo or clear some marks." : "Достигнут предел разметки. Отмените или очистите часть пометок."); return;
            }
            const point = imagePoint(event.clientX, event.clientY, event.currentTarget.getBoundingClientRect());
            const mark: ImageMark = {tool, color, width: Math.max(0.0001, Math.min(0.1, thickness / width)), points: [point, point]};
            activeStroke.current = { pointer: event.pointerId, mark }; setStroke(mark);
            event.currentTarget.setPointerCapture(event.pointerId);
          }}
          onPointerMove={event => {
            const active = activeStroke.current;
            if (!active || active.pointer !== event.pointerId) return;
            const point = imagePoint(event.clientX, event.clientY, event.currentTarget.getBoundingClientRect());
            const previous = active.mark.points.at(-1)!;
            if (Math.hypot(point[0] - previous[0], point[1] - previous[1]) < 0.0005) return;
            const freehand = ["pen", "marker"].includes(active.mark.tool);
            if (freehand && active.mark.points.length >= 5000) return;
            const points = freehand ? [...active.mark.points, point] : [active.mark.points[0], point];
            const mark = { ...active.mark, points };
            activeStroke.current = { ...active, mark }; setStroke(mark);
          }}
          onPointerUp={event => {
            const active = activeStroke.current;
            if (!active || active.pointer !== event.pointerId) return;
            commit([...marks, active.mark]); activeStroke.current = null; setStroke(null);
            event.currentTarget.releasePointerCapture(event.pointerId);
          }}
          onLostPointerCapture={() => { activeStroke.current = null; setStroke(null); }}
        >
          {marks.map((mark, index) => <Mark key={index} mark={mark} width={natural.width} height={natural.height} />)}
          {stroke && <Mark mark={stroke} width={natural.width} height={natural.height} />}
        </svg>}
        </motion.div>
      </div>
    </div>
  );
}
