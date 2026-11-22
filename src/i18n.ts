import { useSyncExternalStore } from "react";
import { translate } from "./translations.mjs";
import type { Language } from "./translations.mjs";

let language: Language = "ru";
const listeners = new Set<() => void>();
export const getLanguage = () => language;
export function setLanguage(next: Language) {
  if (next === language) return;
  language = next;
  listeners.forEach((listener) => listener());
}
export function useLanguage() {
  return useSyncExternalStore((callback) => {
    listeners.add(callback);
    return () => {
      listeners.delete(callback);
    };
  }, getLanguage);
}
export const t = (message: string, values?: Record<string, string | number>) =>
  translate(message, language, values);
