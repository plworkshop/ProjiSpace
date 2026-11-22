import { useEffect, useId, useRef, useState } from "react";
import type { ComponentProps, ReactNode } from "react";
import { AnimatePresence, motion, useIsPresent, useReducedMotion } from "motion/react";
import { Hand, PenLine, Highlighter, Minus, ArrowUpRight, Square, Circle, Undo2, Redo2, Trash2, Save, LoaderCircle, ChevronDown, MoreHorizontal, Check } from "lucide-react";
import { IconButton } from "./ui";
import { getLanguage } from "./i18n";
import type { MarkTool } from "./annotations";

function MenuSurface(props: ComponentProps<typeof motion.div>) {
  const present = useIsPresent();
  return <motion.div {...props} inert={!present} aria-hidden={!present} />;
}

function ToolMenu({ label, trigger, active, disabled, activate, selectedLabel, settings = false, children }: {
  label: string; trigger: ReactNode; active?: boolean; disabled: boolean;
  activate?: () => void; selectedLabel?: string; settings?: boolean;
  children: (close: () => void) => ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const id = useId();
  const wrapper = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const reduced = useReducedMotion();
  function close() { setOpen(false); button.current?.focus(); }
  useEffect(() => {
    if (!open) return;
    (panel.current?.querySelector<HTMLButtonElement>('button[aria-checked="true"], button[aria-pressed="true"]') ?? panel.current?.querySelector<HTMLButtonElement>('button:not(:disabled)'))?.focus();
    const outside = (event: PointerEvent) => {
      if (!wrapper.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", outside);
    return () => document.removeEventListener("pointerdown", outside);
  }, [open]);
  return <div className="markup-menu" ref={wrapper} onKeyDown={event => {
    if (event.key === "Escape" && open) { event.preventDefault(); event.stopPropagation(); close(); }
    if (event.key === "Tab") requestAnimationFrame(() => {
      if (!wrapper.current?.contains(document.activeElement)) setOpen(false);
    });
  }}>
    <div className={activate ? "markup-split" : undefined}>
      {activate && <button type="button" className="markup-tool" title={selectedLabel} aria-label={selectedLabel} aria-pressed={active} disabled={disabled} onClick={() => { setOpen(false); activate(); }}>{trigger}</button>}
      <button ref={button} type="button" className={`markup-tool markup-menu-trigger ${activate ? "markup-caret" : ""}`} aria-label={label} title={label}
        aria-haspopup={settings ? "dialog" : "menu"} aria-expanded={open} aria-controls={id} disabled={disabled} onClick={() => setOpen(value => !value)}
        onKeyDown={event => { if (["ArrowDown", "ArrowUp"].includes(event.key)) { event.preventDefault(); setOpen(true); } }}>
        {activate ? <ChevronDown size={11} /> : trigger}
      </button>
    </div>
    <AnimatePresence>{open && <MenuSurface id={id} ref={panel} className={`markup-popup ${settings ? "markup-stroke-popup" : ""}`} role={settings ? "dialog" : "menu"} aria-label={label}
      initial={{ opacity: 0, y: reduced ? 0 : -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: reduced ? 0 : -3 }}
      transition={{ duration: reduced ? 0 : 0.14 }}
      onKeyDown={event => {
        if (settings || !["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) return;
        event.preventDefault(); event.stopPropagation();
        const options = [...event.currentTarget.querySelectorAll<HTMLButtonElement>('button:not(:disabled)')];
        const current = options.indexOf(document.activeElement as HTMLButtonElement);
        const next = event.key === "Home" ? 0 : event.key === "End" ? options.length - 1 : (current + (event.key === "ArrowUp" ? -1 : 1) + options.length) % options.length;
        options[next]?.focus();
      }}>{children(close)}</MenuSurface>}</AnimatePresence>
  </div>;
}

export default function ImageMarkupToolbar({ tool, setTool, color, setColor, thickness, setThickness, disabled, canUndo, canRedo, canClear, undo, redo, clear, loaded, dirty, saving, save }: {
  tool: MarkTool | "pan"; setTool: (tool: MarkTool | "pan") => void;
  color: string; setColor: (color: string) => void; thickness: number; setThickness: (width: number) => void;
  disabled: boolean; canUndo: boolean; canRedo: boolean; canClear: boolean;
  undo: () => void; redo: () => void; clear: () => void; loaded: boolean; dirty: boolean; saving: boolean; save: () => void;
}) {
  const en = getLanguage() === "en";
  const [brush, setBrush] = useState<"pen" | "marker">("pen");
  const [shape, setShape] = useState<"line" | "arrow" | "rectangle" | "ellipse">("arrow");
  const brushes = [["pen", PenLine, en ? "Pen" : "Ручка"], ["marker", Highlighter, en ? "Marker" : "Маркер"]] as const;
  const shapes = [["line", Minus, en ? "Line" : "Линия"], ["arrow", ArrowUpRight, en ? "Arrow" : "Стрелка"], ["rectangle", Square, en ? "Rectangle" : "Прямоугольник"], ["ellipse", Circle, en ? "Ellipse" : "Овал"]] as const;
  const currentBrush = brushes.find(item => item[0] === brush)!;
  const currentShape = shapes.find(item => item[0] === shape)!;
  const BrushIcon = currentBrush[1], ShapeIcon = currentShape[1];
  return <div className="image-markup-toolbar" role="toolbar" aria-label={en ? "Image markup" : "Разметка изображения"}>
    <div className="markup-tools">
      <button type="button" className="markup-tool" aria-label={en ? "Pan" : "Перемещение"} title={en ? "Pan" : "Перемещение"} aria-pressed={tool === "pan"} disabled={disabled} onClick={() => setTool("pan")}><Hand size={17} /></button>
      <ToolMenu label={en ? "Drawing tools" : "Инструменты рисования"} trigger={<BrushIcon size={17} />} selectedLabel={currentBrush[2]} active={tool === brush} disabled={disabled} activate={() => setTool(brush)}>
        {close => brushes.map(([value, Icon, label]) => <button key={value} type="button" className="markup-option" role="menuitemradio" tabIndex={-1} aria-checked={brush === value} onClick={() => { setBrush(value); setTool(value); close(); }}><Icon size={16} /><span>{label}</span>{brush === value && <Check size={13} />}</button>)}
      </ToolMenu>
      <ToolMenu label={en ? "Shapes" : "Фигуры"} trigger={<ShapeIcon size={17} />} selectedLabel={currentShape[2]} active={tool === shape} disabled={disabled} activate={() => setTool(shape)}>
        {close => shapes.map(([value, Icon, label]) => <button key={value} type="button" className="markup-option" role="menuitemradio" tabIndex={-1} aria-checked={shape === value} onClick={() => { setShape(value); setTool(value); close(); }}><Icon size={16} /><span>{label}</span>{shape === value && <Check size={13} />}</button>)}
      </ToolMenu>
    </div>
    <span className="markup-divider" aria-hidden="true" />
    <ToolMenu label={en ? "Stroke settings" : "Настройки штриха"} settings disabled={disabled}
      trigger={<><span className="markup-color-dot" style={{ backgroundColor: color }} /><span className="markup-width-value">{tool === "marker" ? thickness * 5 : thickness} px</span><ChevronDown size={11} /></>}>
      {() => <>
        <div className="markup-setting-label">{en ? "Color" : "Цвет"}</div>
        <div className="markup-colors" role="group" aria-label={en ? "Color" : "Цвет"}>
          {["#ed5268", "#3f8cff", "#ffd34e", "#40cb9a", "#ffffff", "#182231"].map(value => <button type="button" key={value} className="markup-swatch" style={{ "--swatch": value } as React.CSSProperties} aria-label={`${en ? "Color" : "Цвет"} ${value}`} aria-pressed={color === value} onClick={() => setColor(value)} />)}
          <input type="color" value={color} aria-label={en ? "Custom color" : "Другой цвет"} title={en ? "Custom color" : "Другой цвет"} onChange={event => setColor(event.target.value)} />
        </div>
        <div className="markup-setting-label">{en ? "Stroke width" : "Толщина линии"}</div>
        <div className="markup-widths" role="group" aria-label={en ? "Stroke width" : "Толщина линии"}>
          {[2, 3, 5, 8].map(value => <button type="button" key={value} aria-pressed={thickness === value} onClick={() => setThickness(value)}><span style={{ height: value }} />{tool === "marker" ? value * 5 : value} px</button>)}
        </div>
      </>}
    </ToolMenu>
    <span className="markup-divider" aria-hidden="true" />
    <div className="markup-tools">
      <IconButton label={en ? "Undo markup" : "Отменить пометку"} disabled={disabled || !canUndo} onClick={undo}><Undo2 size={16} /></IconButton>
      <IconButton label={en ? "Redo markup" : "Вернуть пометку"} disabled={disabled || !canRedo} onClick={redo}><Redo2 size={16} /></IconButton>
      <ToolMenu label={en ? "More actions" : "Другие действия"} trigger={<MoreHorizontal size={18} />} disabled={disabled}>
        {close => <button type="button" className="markup-option markup-clear" role="menuitem" tabIndex={-1} disabled={!canClear} onClick={() => { clear(); close(); }}><Trash2 size={16} /><span>{en ? "Clear markup" : "Очистить разметку"}</span></button>}
      </ToolMenu>
    </div>
    <button type="button" className="button primary small markup-save" disabled={disabled || !dirty} onClick={save}>
      {saving ? <LoaderCircle size={15} className="spin" /> : <Save size={15} />}
      {!loaded ? (en ? "Loading…" : "Загрузка…") : saving ? (en ? "Saving…" : "Сохраняем…") : dirty ? (en ? "Save markup" : "Сохранить разметку") : (en ? "Saved" : "Сохранено")}
    </button>
  </div>;
}
