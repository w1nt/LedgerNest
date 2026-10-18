import zhCN from "./locales/zh-CN.ts";
import enUS from "./locales/en-US.ts";
import type {
  MessageKey,
  MessageParams,
  Messages,
  MessageValue,
} from "./types.ts";

/** 新增语言：补齐同一套 MessageKey，并在此注册；设置选项由注册表生成。 */
export const languages = {
  "zh-CN": { nativeName: "简体中文", messages: zhCN },
  "en-US": { nativeName: "English", messages: enUS },
} satisfies Record<string, { nativeName: string; messages: Messages }>;
export type Locale = keyof typeof languages;
export type LanguagePreference = Locale | "system";
export const languageStorageKey = "billing-language";
export const fallbackLocale: Locale = "en-US";
export function isMessageKey(value: string): value is MessageKey {
  return Object.hasOwn(enUS, value);
}
export function isLocale(value: unknown): value is Locale {
  return typeof value === "string" && Object.hasOwn(languages, value);
}
export function languagePreference(value: unknown): LanguagePreference {
  return value === "system" || isLocale(value) ? value : "system";
}
/** 按浏览器首选顺序匹配：先完整标签，再匹配语言族（如 en-GB、zh-TW）。 */
export function matchLanguage(preferred: readonly string[]): Locale {
  const supported = Object.keys(languages) as Locale[];
  for (const candidate of preferred) {
    const tag = candidate.toLowerCase();
    const exact = supported.find((locale) => locale.toLowerCase() === tag);
    if (exact) return exact;
    const family = supported.find(
      (locale) => locale.split("-")[0] === tag.split("-")[0],
    );
    if (family) return family;
  }
  return fallbackLocale;
}
export function browserLanguages(): readonly string[] {
  return typeof navigator === "undefined"
    ? []
    : navigator.languages?.length
      ? navigator.languages
      : [navigator.language];
}
export function translate(
  locale: Locale,
  key: MessageKey,
  params: MessageParams = {},
): string {
  // 使用文本插值，不解释 HTML、不使用 eval；后端及用户数据保持原文。
  const value: MessageValue =
    languages[locale].messages[key] ?? languages[fallbackLocale].messages[key];
  const message =
    typeof value === "string"
      ? value
      : (value[new Intl.PluralRules(locale).select(Number(params.count))] ??
        value.other);
  return message.replace(/\{(\w+)\}/gu, (token, name: string) =>
    Object.hasOwn(params, name)
      ? typeof params[name] === "number"
        ? new Intl.NumberFormat(locale).format(params[name])
        : String(params[name])
      : token,
  );
}
let preference: LanguagePreference = "system";
let locale = matchLanguage(browserLanguages());
const listeners = new Set<() => void>();
export const currentLocale = () => locale;
export const currentPreference = () => preference;
export const languageSnapshot = () => `${preference}:${locale}`;
export function subscribeLanguage(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
export function updateLanguage(
  next: LanguagePreference,
  preferred = browserLanguages(),
) {
  const resolved = next === "system" ? matchLanguage(preferred) : next;
  if (next === preference && resolved === locale) return;
  preference = next;
  locale = resolved;
  listeners.forEach((listener) => listener());
}
/** 供非 React 的金额格式化、校验及 API 错误使用；组件通过 useI18n 订阅更新。 */
export const t = (key: MessageKey, params?: MessageParams) =>
  translate(locale, key, params);
