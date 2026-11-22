import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { Check, ChevronDown, Globe2 } from "lucide-react";
import type { Language } from "./translations.mjs";
import { languageOptions as languages } from "./translations.mjs";
import { t } from "./i18n";

export default function LanguagePicker({
  language,
  disabled,
  onChange,
}: {
  language: Language;
  disabled: boolean;
  onChange: (language: Language) => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const wrapper = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLDivElement>(null);
  const reduced = useReducedMotion();
  useEffect(() => {
    if (!open) return;
    menu.current
      ?.querySelector<HTMLButtonElement>(`[data-language="${language}"]`)
      ?.focus();
    function outside(event: PointerEvent) {
      if (!wrapper.current?.contains(event.target as Node)) setOpen(false);
    }
    document.addEventListener("pointerdown", outside);
    return () => document.removeEventListener("pointerdown", outside);
  }, [open, language]);
  function close() {
    setOpen(false);
    trigger.current?.focus();
  }
  return (
    <div
      className="language-picker"
      ref={wrapper}
      onBlurCapture={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node))
          setOpen(false);
      }}
      onKeyDown={(event) => {
        if (event.key.startsWith("Arrow")) event.stopPropagation();
        if (event.key === "Escape" && open) {
          event.preventDefault();
          event.stopPropagation();
          close();
        }
      }}
    >
      <button
        type="button"
        ref={trigger}
        className="language-trigger"
        disabled={disabled}
        aria-label={t("Язык интерфейса")}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls="language-menu"
        onClick={() => setOpen((value) => !value)}
        onKeyDown={(event) => {
          if (["ArrowDown", "ArrowUp"].includes(event.key)) {
            event.preventDefault();
            event.stopPropagation();
            setOpen(true);
          }
        }}
      >
        <Globe2 size={14} aria-hidden="true" />
        <span lang={language} dir={language === "he" ? "rtl" : "ltr"}>
          {languages.find((item) => item.value === language)!.label}
        </span>
        <ChevronDown
          className="language-chevron"
          size={12}
          aria-hidden="true"
        />
      </button>
      <AnimatePresence>
        {open && (
          <motion.div
            id="language-menu"
            ref={menu}
            className="language-menu"
            role="menu"
            aria-label={t("Язык интерфейса")}
            initial={{ opacity: 0, y: reduced ? 0 : -5 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: reduced ? 0 : -4 }}
            transition={{
              duration: reduced ? 0 : 0.16,
              ease: [0.2, 0.8, 0.2, 1],
            }}
            onKeyDown={(event) => {
              if (
                ![
                  "ArrowDown",
                  "ArrowUp",
                  "ArrowLeft",
                  "ArrowRight",
                  "Home",
                  "End",
                ].includes(event.key)
              )
                return;
              event.preventDefault();
              event.stopPropagation();
              const options = [
                ...event.currentTarget.querySelectorAll<HTMLButtonElement>(
                  "button",
                ),
              ];
              const current = options.indexOf(
                document.activeElement as HTMLButtonElement,
              );
              const next =
                event.key === "Home"
                  ? 0
                  : event.key === "End"
                    ? options.length - 1
                    : (current +
                        (event.key === "ArrowUp" || event.key === "ArrowLeft"
                          ? -1
                          : 1) +
                        options.length) %
                      options.length;
              options[next]?.focus();
            }}
          >
            {languages.map((item) => (
              <button
                key={item.value}
                type="button"
                role="menuitemradio"
                aria-checked={language === item.value}
                data-language={item.value}
                className="language-option"
                disabled={disabled}
                tabIndex={language === item.value ? 0 : -1}
                onClick={async () => {
                  await onChange(item.value);
                  close();
                }}
              >
                <span className="language-hover-highlight" aria-hidden="true" />
                <span
                  lang={item.value}
                  dir={item.value === "he" ? "rtl" : "ltr"}
                >
                  {item.label}
                </span>
                {language === item.value && (
                  <Check size={13} aria-hidden="true" />
                )}
              </button>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
