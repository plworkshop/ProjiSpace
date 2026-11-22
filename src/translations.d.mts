export type Language =
  | "ru"
  | "en"
  | "de"
  | "es"
  | "fr"
  | "pt"
  | "uk"
  | "he"
  | "zh"
  | "ko"
  | "ja";
export const supportedLanguages: readonly Language[];
export const languageOptions: { value: Language; label: string }[];
export const english: Record<string, string>;
export const dictionaries: Record<
  Exclude<Language, "ru">,
  Record<string, string>
>;
export function translate(
  message: string,
  language?: Language,
  values?: Record<string, string | number>,
): string;
