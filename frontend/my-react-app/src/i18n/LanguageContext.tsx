import { createContext, useContext } from "react";
import type { LanguagePreference, Locale } from "./core";
import type { MessageKey, MessageParams } from "./types";

export const LanguageContext = createContext<{
  locale: Locale;
  preference: LanguagePreference;
  setPreference: (preference: LanguagePreference) => void;
  t: (key: MessageKey, params?: MessageParams) => string;
} | null>(null);
export function useI18n() {
  const context = useContext(LanguageContext);
  if (!context) throw new Error("useI18n must be used within LanguageProvider");
  return context;
}
