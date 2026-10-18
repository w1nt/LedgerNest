import type zhCN from "./locales/zh-CN.ts";

export type MessageKey = keyof typeof zhCN;
/** 可选复数形式交给 Intl.PluralRules 选择；other 是通用兜底。 */
export type MessageValue =
  string | ({ other: string } & Partial<Record<Intl.LDMLPluralRule, string>>);
export type Messages = Record<MessageKey, MessageValue>;
export type MessageParams = Record<string, string | number>;
