import { useEffect, useSyncExternalStore } from "react";
import type { ReactNode } from "react";
import { LanguageContext } from "./LanguageContext";
import {
  currentLocale,
  currentPreference,
  languagePreference,
  languageSnapshot,
  languageStorageKey,
  subscribeLanguage,
  translate,
  updateLanguage,
} from "./core";
import type { LanguagePreference } from "./core";
import { savedLanguage, saveLanguage } from "../security/storage";
function setPreference(next: LanguagePreference) {
  saveLanguage(next);
  updateLanguage(next);
}
export default function LanguageProvider({
  children,
}: {
  children: ReactNode;
}) {
  useSyncExternalStore(subscribeLanguage, languageSnapshot);
  const locale = currentLocale();
  const preference = currentPreference();
  useEffect(() => {
    const refresh = () => updateLanguage(currentPreference());
    const onStorage = (event: StorageEvent) => {
      if (event.key === languageStorageKey || event.key === null)
        updateLanguage(languagePreference(savedLanguage()));
    };
    window.addEventListener("languagechange", refresh);
    window.addEventListener("focus", refresh);
    window.addEventListener("storage", onStorage);
    return () => {
      window.removeEventListener("languagechange", refresh);
      window.removeEventListener("focus", refresh);
      window.removeEventListener("storage", onStorage);
    };
  }, []);
  useEffect(() => {
    document.documentElement.lang = locale;
    document.title = translate(locale, "document.title");
    document
      .querySelector('meta[name="description"]')
      ?.setAttribute("content", translate(locale, "document.description"));
  }, [locale]);
  return (
    <LanguageContext.Provider
      value={{
        locale,
        preference,
        setPreference,
        t: (key, params) => translate(locale, key, params),
      }}
    >
      {children}
    </LanguageContext.Provider>
  );
}
