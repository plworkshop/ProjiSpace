import { t } from "./i18n";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  AnimatePresence,
  motion,
  useMotionValue,
  useReducedMotion,
  useSpring,
  useTransform,
} from "motion/react";
import { Art } from "./Art";
import { IconButton } from "./ui";
import LanguagePicker from "./LanguagePicker";
import type { Language } from "./translations.mjs";
import { startPicker, vote, winnerId, randomWinner } from "./selection";
import type { PickerState } from "./selection";
import type { Appearance, PickerTheme, Project, Reference } from "./types";
import type { CSSProperties } from "react";
import {
  ArrowRight,
  ArrowUpRight,
  Check,
  Layers3,
  Moon,
  Settings2,
  Shuffle,
  RotateCcw,
  Sparkles,
  Scan,
  Sun,
  X,
} from "lucide-react";
function GameCard({
  project,
  cover,
  winner,
  decide,
  open,
  disabled,
  collectionIndex,
  theme,
}: {
  project: Project;
  cover?: string;
  winner: boolean;
  decide: (yes: boolean) => void;
  open: () => void;
  disabled: boolean;
  collectionIndex: number;
  theme: PickerTheme;
}) {
  const reduced = useReducedMotion();
  const x = useMotionValue(0);
  const tiltX = useSpring(0, { stiffness: 180, damping: 24 });
  const tiltY = useSpring(0, { stiffness: 180, damping: 24 });
  const [dragging, setDragging] = useState(false);
  const foilPosition = useTransform(
    [tiltX, tiltY, x],
    ([vertical, horizontal, drag]) =>
      `${50 + Number(horizontal) * 6 + Number(drag) * 0.12}% ${50 - Number(vertical) * 6}%`,
  );
  const rotate = useTransform(x, [-220, 220], [-15, 15]);
  const yesOpacity = useTransform(x, [20, 110], [0, 1]);
  const noOpacity = useTransform(x, [-110, -20], [1, 0]);
  return (
    <motion.div
      className={`game-card art-${project.art} ${winner ? "winner-card" : ""}`}
      data-palette={(collectionIndex - 1) % 6}
      data-dragging={dragging}
      style={{
        x,
        rotate: reduced ? 0 : rotate,
        rotateX: reduced ? 0 : tiltX,
        rotateY: reduced ? 0 : tiltY,
      }}
      drag={!winner && !disabled ? "x" : false}
      dragConstraints={{ left: 0, right: 0 }}
      dragElastic={0.82}
      onDragStart={() => setDragging(true)}
      onDragEnd={(_, info) => {
        setDragging(false);
        if (disabled) return;
        if (info.offset.x > 95 || info.velocity.x > 550) decide(true);
        else if (info.offset.x < -95 || info.velocity.x < -550) decide(false);
      }}
      onPointerLeave={() => {
        tiltX.set(0);
        tiltY.set(0);
      }}
      whileTap={!winner ? { cursor: "grabbing" } : undefined}
      onPointerMove={(e) => {
        if (reduced || e.pointerType === "touch") return;
        const box = e.currentTarget.getBoundingClientRect();
        tiltX.set(
          -((e.clientY - box.top) / box.height - 0.5) *
            (theme === "tech" ? 4 : 7),
        );
        tiltY.set(
          ((e.clientX - box.left) / box.width - 0.5) *
            (theme === "tech" ? 5 : 9),
        );
      }}
    >
      {theme === "game" && (
        <div className="card-effects" aria-hidden="true">
          <div className="card-reward-rays" />
          {Array.from({ length: 10 }, (_, i) => (
            <span
              key={i}
              className="card-spark"
              style={
                {
                  left: `${i % 2 ? 102 : -2}%`,
                  top: `${8 + ((i * 23) % 85)}%`,
                  "--spark-delay": `${i * 65}ms`,
                } as CSSProperties
              }
            />
          ))}
          {winner &&
            Array.from({ length: 24 }, (_, i) => {
              const angle = i * 2.4;
              return (
                <span
                  key={`confetti-${i}`}
                  className="card-confetti"
                  style={
                    {
                      "--confetti-x": `${Math.cos(angle) * (170 + (i % 4) * 30)}px`,
                      "--confetti-y": `${Math.sin(angle) * 210 - 70}px`,
                      "--confetti-turn": `${i % 2 ? 540 : -540}deg`,
                      "--confetti-delay": `${(i % 6) * 35}ms`,
                    } as CSSProperties
                  }
                />
              );
            })}
        </div>
      )}
      <motion.div
        className="card-foil"
        aria-hidden="true"
        style={{ backgroundPosition: foilPosition }}
      />
      <motion.div
        className="card-prism"
        aria-hidden="true"
        style={{ backgroundPosition: foilPosition }}
      />
      {theme === "game" && (
        <svg
          className="card-frame"
          viewBox="0 0 360 500"
          preserveAspectRatio="none"
          aria-hidden="true"
        >
          <path
            className="card-frame-outline"
            d="M18 74V30l12-12h30l17 31h206l17-31h30l12 12v134l-13 10v136l13 10v112H18V320l13-10V174l-13-10z"
          />
          <path className="card-header-plate" d="M61 9h238l-20 43H81z" />
          <path
            className="card-frame-stripes"
            d="M18 86l11 6v10l-11-6zm0 17 11 6v10l-11-6zm0 17 11 6v10l-11-6zm0 17 11 6v10l-11-6zM342 86l-11 6v10l11-6zm0 17-11 6v10l11-6zm0 17-11 6v10l11-6zm0 17-11 6v10l11-6zM9 266l21 13v12L9 278zm0 22 21 13v12L9 300zm0 22 21 13v12L9 322zm0 22 21 13v12L9 344zM347 37h5v5h-5zm0 9h5v5h-5zm0 9h5v5h-5z"
          />
          <path
            className="card-frame-fine"
            d="M89 58h182M27 187v70m306-70v70M36 405h181"
          />
        </svg>
      )}
      <div className="card-topline">
        <span className="card-sigil" aria-hidden="true">
          <Layers3 size={14} />
        </span>
      </div>
      <h2 className="card-name" title={project.name} dir="auto">
        <span>{project.name}</span>
      </h2>
      <div className="card-image">
        {cover ? (
          <img
            src={cover}
            alt={t("Обложка: {v0}", { v0: project.name })}
            draggable={false}
          />
        ) : (
          <Art kind={project.art} />
        )}
      </div>
      <span className="card-type-label" dir="auto">
        {project.category || t("Личный проект")}
      </span>
      <div className="card-copy">
        {project.description && <p dir="auto">{project.description}</p>}
      </div>
      <div
        className="card-number-badge"
        aria-label={t("Проект {v0}", { v0: collectionIndex })}
      >
        <span>{String(collectionIndex).padStart(2, "0")}</span>
      </div>
      {!winner && (
        <>
          <motion.div
            className="vote-stamp yes-stamp"
            aria-hidden="true"
            style={{ opacity: yesOpacity }}
          >
            {" "}
            {t("БЕРЁМ")}{" "}
          </motion.div>
          <motion.div
            className="vote-stamp no-stamp"
            aria-hidden="true"
            style={{ opacity: noOpacity }}
          >
            {" "}
            {t("ПОЗЖЕ")}{" "}
          </motion.div>
        </>
      )}
      {winner && (
        <button
          className="winner-hit"
          aria-label={t("Открыть проект {v0}", { v0: project.name })}
          onClick={open}
          disabled={disabled}
        />
      )}
    </motion.div>
  );
}
export default function Picker({
  projects,
  references,
  openProject,
  newProject,
  browse,
  theme,
  onThemeChange,
  themeBusy,
  appearance,
  onAppearanceChange,
  appearanceBusy,
  language,
  languageBusy,
  onLanguageChange,
}: {
  projects: Project[];
  references: Reference[];
  openProject: (id: string) => void;
  newProject: () => void;
  browse: () => void;
  theme: PickerTheme;
  onThemeChange: (theme: PickerTheme) => void;
  themeBusy: boolean;
  appearance: Appearance;
  onAppearanceChange: (appearance: Appearance) => void;
  appearanceBusy: boolean;
  language: Language;
  languageBusy: boolean;
  onLanguageChange: (language: Language) => Promise<void>;
}) {
  const roots = projects.filter((p) => !p.parentId);
  const [state, setState] = useState<PickerState>(() =>
    startPicker(roots.map((p) => p.id)),
  );
  const [history, setHistory] = useState<PickerState[]>([]);
  const [direction, setDirection] = useState(1);
  const [animating, setAnimating] = useState(false);
  const [shuffling, setShuffling] = useState(false);
  const [randomResult, setRandomResult] = useState(false);
  const lock = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reduced = useReducedMotion();
  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );
  const choose = useCallback(
    (yes: boolean) => {
      if (lock.current || state.result !== "picking") return;
      lock.current = true;
      setAnimating(true);
      setDirection(yes ? 1 : -1);
      setHistory((h) => [...h, state]);
      setState((s) => vote(s, yes));
      timer.current = setTimeout(
        () => {
          lock.current = false;
          setAnimating(false);
        },
        reduced ? 30 : 430,
      );
    },
    [state, reduced],
  );
  useEffect(() => {
    function key(e: KeyboardEvent) {
      if (
        document.querySelector("dialog[open]") ||
        (e.target instanceof HTMLElement &&
          (["INPUT", "TEXTAREA", "SELECT"].includes(e.target.tagName) ||
            e.target.closest(".picker-appearance") ||
            e.target.isContentEditable))
      )
        return;
      if (e.key === "ArrowRight") {
        e.preventDefault();
        choose(true);
      }
      if (e.key === "ArrowLeft") {
        e.preventDefault();
        choose(false);
      }
    }
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [choose]);
  const current = projects.find(
    (p) =>
      p.id ===
      (state.result === "winner" ? winnerId(state) : state.pool[state.index]),
  );
  const cover = references.find((r) => r.id === current?.coverId)?.url;
  function reset() {
    if (lock.current) return;
    setState(startPicker(roots.map((p) => p.id)));
    setHistory([]);
    setRandomResult(false);
  }
  function chooseRandom() {
    if (lock.current || roots.length < 2) return;
    const result = randomWinner(roots.map((p) => p.id));
    setDirection(0);
    if (reduced) {
      setState(result);
      setHistory([]);
      setRandomResult(true);
      return;
    }
    lock.current = true;
    setAnimating(true);
    setShuffling(true);
    timer.current = setTimeout(() => {
      setShuffling(false);
      setState(result);
      setHistory([]);
      setRandomResult(true);
      timer.current = setTimeout(() => {
        lock.current = false;
        setAnimating(false);
      }, 500);
    }, 680);
  }
  function undo() {
    if (lock.current || !history.length) return;
    setState(history[history.length - 1]);
    setHistory((h) => h.slice(0, -1));
  }
  return (
    <main className={`picker-view picker-${theme}`} data-shuffling={shuffling}>
      <div className="picker-heading">
        <h1>
          {shuffling
            ? t("Перемешиваем…")
            : state.result === "winner"
              ? t("Проект выбран")
              : t("Выберите проект")}
          <span className="heading-star">✳</span>
        </h1>
      </div>
      <div className="picker-arena" aria-busy={shuffling}>
        {theme === "game" && (
          <div
            className={`arena-orbit ${state.result === "winner" ? "winner-glow" : ""}`}
            aria-hidden="true"
          >
            <svg className="portal-light" viewBox="0 0 900 900" fill="none">
              <defs>
                <radialGradient id="portal-haze">
                  <stop
                    offset=".44"
                    stopColor="hsl(calc(var(--accent-hue) + var(--accent-hue-spread) * 1.5) 50.000% 6.275%)"
                    stopOpacity="0"
                  />
                  <stop
                    offset=".67"
                    stopColor="hsl(calc(var(--accent-hue) + var(--accent-hue-spread) * 0.106) 60.428% 36.667%)"
                    stopOpacity=".08"
                  />
                  <stop
                    offset=".74"
                    stopColor="hsl(calc(var(--accent-hue) + var(--accent-hue-spread) * 0.074) 68.201% 53.137%)"
                    stopOpacity=".42"
                  />
                  <stop
                    offset=".82"
                    stopColor="hsl(calc(var(--accent-hue) + var(--accent-hue-spread) * 0.087) 65.714% 41.176%)"
                    stopOpacity=".09"
                  />
                  <stop
                    offset="1"
                    stopColor="hsl(calc(var(--accent-hue) + var(--accent-hue-spread) * 1.5) 50.000% 6.275%)"
                    stopOpacity="0"
                  />
                </radialGradient>
                <linearGradient
                  id="portal-spectrum"
                  x1="180"
                  y1="140"
                  x2="720"
                  y2="780"
                  gradientUnits="userSpaceOnUse"
                >
                  <stop stopColor="hsl(calc(var(--accent-hue) + var(--accent-hue-spread) * -0.22) 75.172% 71.569%)" />
                  <stop
                    offset=".27"
                    stopColor="hsl(calc(var(--accent-hue) + var(--accent-hue-spread) * 0.076) 64.754% 52.157%)"
                  />
                  <stop
                    offset=".52"
                    stopColor="hsl(calc(var(--accent-hue) + var(--accent-hue-spread) * -19.636) 100.000% 87.059%)"
                  />
                  <stop
                    offset=".72"
                    stopColor="hsl(calc(var(--accent-hue) + var(--accent-hue-spread) * -0.085) 62.281% 44.706%)"
                  />
                  <stop
                    offset="1"
                    stopColor="hsl(calc(var(--accent-hue) + var(--accent-hue-spread) * 0.19) 50.400% 49.020%)"
                  />
                </linearGradient>
                <linearGradient
                  id="portal-ray"
                  x1="450"
                  y1="30"
                  x2="450"
                  y2="220"
                  gradientUnits="userSpaceOnUse"
                >
                  <stop
                    stopColor="hsl(calc(var(--accent-hue) + var(--accent-hue-spread) * 0.17) 64.384% 57.059%)"
                    stopOpacity="0"
                  />
                  <stop
                    offset=".52"
                    stopColor="hsl(calc(var(--accent-hue) + var(--accent-hue-spread) * 0.159) 63.713% 53.529%)"
                    stopOpacity=".12"
                  />
                  <stop
                    offset=".72"
                    stopColor="hsl(calc(var(--accent-hue) + var(--accent-hue-spread) * -20.262) 100.000% 88.039%)"
                    stopOpacity=".95"
                  />
                  <stop
                    offset="1"
                    stopColor="hsl(calc(var(--accent-hue) + var(--accent-hue-spread) * 0.17) 64.384% 57.059%)"
                    stopOpacity="0"
                  />
                </linearGradient>
                <filter
                  id="portal-bloom"
                  x="-50%"
                  y="-50%"
                  width="200%"
                  height="200%"
                >
                  <feGaussianBlur stdDeviation="7" />
                </filter>
              </defs>
              <circle cx="450" cy="450" r="445" fill="url(#portal-haze)" />
              <g className="portal-ring" stroke="url(#portal-spectrum)">
                <circle
                  cx="450"
                  cy="450"
                  r="329"
                  strokeWidth="18"
                  opacity=".75"
                  filter="url(#portal-bloom)"
                />
                <circle
                  cx="450"
                  cy="450"
                  r="329"
                  strokeWidth="1.2"
                  opacity=".65"
                />
                <circle
                  cx="450"
                  cy="450"
                  r="319"
                  strokeWidth="2.5"
                  strokeDasharray="96 38 8 150 48 115"
                  opacity=".65"
                />
                <circle
                  cx="450"
                  cy="450"
                  r="344"
                  strokeWidth=".7"
                  strokeDasharray="170 120 5 86"
                  opacity=".25"
                />
              </g>
              <g className="portal-rays">
                {[
                  -171, -143, -119, -86, -62, -39, -13, 18, 47, 81, 108, 136,
                  164,
                ].map((angle, index) => (
                  <g
                    key={angle}
                    transform={`rotate(${angle} 450 450)`}
                    opacity={index % 3 === 0 ? 0.9 : 0.45}
                  >
                    <path
                      d="M448 32 456 122 450 217 444 124Z"
                      fill="url(#portal-ray)"
                    />
                    <path
                      d="M448 92 448 161"
                      stroke="hsl(calc(var(--accent-hue) + var(--accent-hue-spread) * -0.22) 100.000% 78.627%)"
                      strokeWidth="1"
                      opacity=".75"
                    />
                    <path
                      d="M454 108 454 146"
                      stroke="hsl(calc(var(--accent-hue) + var(--accent-hue-spread) * 0.136) 55.696% 69.020%)"
                      strokeWidth="1"
                      opacity=".5"
                    />
                    <circle
                      cx="450"
                      cy="121"
                      r="2.2"
                      fill="hsl(var(--accent-hue) 100.000% 94.118%)"
                    />
                    <path
                      d="M437 121H463"
                      stroke="hsl(calc(var(--accent-hue) + var(--accent-hue-spread) * -0.324) 100.000% 85.490%)"
                      strokeWidth=".8"
                      opacity=".6"
                    />
                  </g>
                ))}
              </g>
              <g
                fill="hsl(calc(var(--accent-hue) + var(--accent-hue-spread) * 0.207) 100.000% 88.627%)"
                opacity=".65"
              >
                <circle cx="135" cy="352" r="1.4" />
                <circle cx="746" cy="288" r="1.7" />
                <circle cx="217" cy="735" r="1" />
                <circle cx="792" cy="533" r="1.1" />
                <circle cx="298" cy="119" r="1.1" />
                <circle cx="638" cy="771" r="1.4" />
              </g>
            </svg>
          </div>
        )}
        {(state.result === "picking" || state.result === "winner") &&
        current ? (
          <>
            <div className="deck-back back-two" />
            <div className="deck-back back-one" />
            <AnimatePresence mode="wait" custom={direction}>
              <motion.div
                className="card-position"
                key={current.id + state.round + state.result}
                custom={direction}
                initial={{
                  opacity: 0,
                  y: reduced || direction === 0 ? 0 : 18,
                  scale: direction === 0 ? 1 : 0.97,
                }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                variants={{
                  leaving: (dir: number) => ({
                    x: reduced ? 0 : dir * 420,
                    rotate: reduced ? 0 : dir * 20,
                    opacity: 0,
                    scale: dir === 0 ? 1 : 0.96,
                  }),
                }}
                exit="leaving"
                transition={{
                  duration: reduced ? 0 : direction === 0 ? 0.22 : 0.3,
                  ease: [0.22, 1, 0.36, 1],
                }}
              >
                <GameCard
                  theme={theme}
                  project={current}
                  cover={cover}
                  winner={state.result === "winner"}
                  decide={choose}
                  open={() => openProject(current.id)}
                  disabled={animating}
                  collectionIndex={
                    roots.findIndex((p) => p.id === current.id) + 1
                  }
                />
              </motion.div>
            </AnimatePresence>
            {state.result === "winner" && (
              <div className="winner-badge">
                {randomResult ? <Shuffle size={15} /> : <Sparkles size={15} />}
                {randomResult
                  ? t("Случайный выбор")
                  : t("ВАШ ПРОЕКТ НА СЕГОДНЯ")}
              </div>
            )}
          </>
        ) : (
          <motion.div
            className="round-summary"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
          >
            <span className="summary-icon">
              {state.result === "empty" ? <Layers3 /> : <Sparkles />}
            </span>
            <h2>
              {!roots.length
                ? t("Нет проектов")
                : state.result === "empty"
                  ? t("Ничего не выбрано")
                  : state.result === "all"
                    ? t("Все проекты прошли дальше")
                    : t("Осталось проектов: {v0}", {
                        v0: state.accepted.length,
                      })}
            </h2>
            <p>
              {!roots.length
                ? t("Создайте первый проект.")
                : state.result === "empty"
                  ? t("Начните заново или выберите из списка.")
                  : state.result === "all"
                    ? t("Отложите хотя бы один проект в следующем раунде.")
                    : t("Продолжите выбор в следующем раунде.")}
            </p>
            <button
              className="button primary"
              disabled={animating}
              onClick={
                !roots.length
                  ? newProject
                  : state.result === "empty"
                    ? reset
                    : () => {
                        setState(startPicker(state.accepted, state.round + 1));
                        setHistory([]);
                      }
              }
            >
              {!roots.length
                ? t("Создать первый проект")
                : state.result === "empty"
                  ? t("Начать заново")
                  : t("Следующий раунд")}
              <ArrowRight size={17} />
            </button>
            {roots.length > 0 && (
              <button
                className="text-button"
                onClick={browse}
                disabled={animating}
              >
                {" "}
                {t("Выбрать из списка")}{" "}
              </button>
            )}
          </motion.div>
        )}
      </div>
      <div className="picker-bottom">
        {state.result === "picking" ? (
          <>
            <div
              className="decision-controls"
              role="group"
              aria-label={t("Выбор проекта")}
            >
              <button
                className="decision-button decision-later"
                aria-keyshortcuts="ArrowLeft"
                onClick={() => choose(false)}
                disabled={animating}
              >
                <X size={18} /> {t("Позже")}{" "}
              </button>
              <IconButton
                label={t("Отменить последний свайп")}
                onClick={undo}
                disabled={!history.length || animating}
                className="decision-undo"
              >
                <RotateCcw size={19} />
              </IconButton>
              <button
                className="decision-button decision-choose"
                aria-keyshortcuts="ArrowRight"
                title={t("Оставить в выборе")}
                onClick={() => choose(true)}
                disabled={animating}
              >
                <Check size={19} /> {t("Выбрать")}{" "}
              </button>
            </div>
            <div className="decision-progress" aria-live="polite">
              <span>
                {state.index + 1} {t("из")} {state.pool.length}
              </span>
              {state.round > 1 && (
                <span>
                  {t("Раунд")} {state.round}
                </span>
              )}
            </div>
          </>
        ) : state.result === "winner" && current ? (
          <>
            <button
              className="button primary open-winner"
              disabled={animating}
              onClick={() => openProject(current.id)}
            >
              <span className="warp-stars" aria-hidden="true">
                {Array.from({ length: 22 }, (_, i) => {
                  const angle = i * 2.4;
                  const dx = Math.cos(angle) * 145;
                  const dy = Math.sin(angle) * 48;
                  return (
                    <span
                      key={i}
                      className="warp-star"
                      style={
                        {
                          "--warp-x": `${dx}px`,
                          "--warp-y": `${dy}px`,
                          "--warp-angle": `${Math.atan2(dy, dx)}rad`,
                          "--warp-speed": `${0.72 + (i % 4) * 0.06}s`,
                          "--warp-delay": `${-i * 0.047}s`,
                        } as CSSProperties
                      }
                    />
                  );
                })}
              </span>
              <span className="warp-label">
                {" "}
                {t("Открыть проект")}{" "}
                <ArrowUpRight size={19} aria-hidden="true" />
              </span>
            </button>
            <button
              className="text-button"
              onClick={reset}
              disabled={animating}
            >
              <RotateCcw size={14} /> {t("Выбрать заново")}{" "}
            </button>
          </>
        ) : null}
        {roots.length > 1 && (
          <button
            type="button"
            className="picker-random-button"
            onClick={chooseRandom}
            aria-disabled={animating}
          >
            <Shuffle size={15} aria-hidden="true" />
            <span>
              {shuffling ? t("Перемешиваем…") : t("Случайный проект")}
            </span>
          </button>
        )}
        <span className="sr-only" role="status">
          {shuffling
            ? t("Перемешиваем…")
            : randomResult && current
              ? `${t("Проект выбран")}: ${current.name}`
              : ""}
        </span>
      </div>
      <div className="picker-appearance">
        <button
          type="button"
          className="picker-appearance-trigger"
          popoverTarget="picker-appearance-panel"
        >
          <Settings2 size={15} aria-hidden="true" />
          <span>{t("Настройки")}</span>
        </button>
        <div
          id="picker-appearance-panel"
          className="picker-appearance-panel"
          popover="auto"
          role="dialog"
          aria-labelledby="picker-appearance-title"
        >
          <div className="picker-appearance-heading">
            <span id="picker-appearance-title">{t("Настройки")}</span>
            <button
              type="button"
              className="icon-button"
              popoverTarget="picker-appearance-panel"
              popoverTargetAction="hide"
              aria-label={t("Закрыть")}
            >
              <X size={15} />
            </button>
          </div>
          <div className="picker-appearance-row">
            <span>{t("Тема карточек")}</span>
            <div
              className="picker-theme-switch"
              role="group"
              aria-label={t("Тема карточек")}
              aria-busy={themeBusy}
            >
              <button
                type="button"
                aria-pressed={theme === "game"}
                aria-disabled={themeBusy}
                onClick={() => !themeBusy && onThemeChange("game")}
              >
                <Sparkles size={14} aria-hidden="true" /> {t("Игровая")}
              </button>
              <button
                type="button"
                aria-pressed={theme === "tech"}
                aria-disabled={themeBusy}
                onClick={() => !themeBusy && onThemeChange("tech")}
              >
                <Scan size={14} aria-hidden="true" /> {t("Техно")}
              </button>
            </div>
          </div>
          <div className="picker-appearance-row">
            <span>{t("Светлая тема")}</span>
            <div className="picker-mode-switch" aria-busy={appearanceBusy}>
              <button
                type="button"
                className="appearance-toggle"
                aria-label={t("Светлая тема")}
                title={
                  appearance === "light" ? t("Тёмная тема") : t("Светлая тема")
                }
                aria-pressed={appearance === "light"}
                aria-disabled={appearanceBusy}
                onClick={() =>
                  !appearanceBusy &&
                  onAppearanceChange(appearance === "light" ? "dark" : "light")
                }
              >
                {appearance === "light" ? (
                  <Sun size={16} aria-hidden="true" />
                ) : (
                  <Moon size={16} aria-hidden="true" />
                )}
              </button>
            </div>
          </div>
          <div className="picker-appearance-row">
            <span>{t("Язык интерфейса")}</span>
            <LanguagePicker
              language={language}
              disabled={languageBusy}
              onChange={onLanguageChange}
            />
          </div>
        </div>
      </div>
    </main>
  );
}
