/** 存储仅包含主题、语言、演示开关和退出通知，不持久化用户资料、密码或登录凭据。 */
import { languageStorageKey } from "../i18n/core.ts";
function read(store: "localStorage" | "sessionStorage", key: string) {
  try {
    return window[store].getItem(key);
  } catch {
    return null;
  }
}
function write(
  store: "localStorage" | "sessionStorage",
  key: string,
  value: string | null,
) {
  try {
    if (value === null) window[store].removeItem(key);
    else window[store].setItem(key, value);
  } catch {
    /* 禁用存储时仍可使用内存状态，不能因此绕过后端身份验证。 */
  }
}
export const savedTheme = () => read("localStorage", "billing-theme");
export const savedLanguage = () => read("localStorage", languageStorageKey);
export const saveLanguage = (preference: string) =>
  write("localStorage", languageStorageKey, preference);
export const saveTheme = (mode: string) =>
  write("localStorage", "billing-theme", mode);
export const savedDemo = () =>
  read("sessionStorage", "billing-demo") === "true";
export const saveDemo = (enabled: boolean) =>
  write("sessionStorage", "billing-demo", enabled ? "true" : null);
export const removeLegacyUser = () => write("localStorage", "user", null);
export const logoutNoticeKey = "billing-logout-notice";
export function announceLogout() {
  let notice: string;
  try {
    notice = crypto.randomUUID();
  } catch {
    notice = `${Date.now()}-${performance.now()}`;
  }
  // 这是退出事件去重标记，不是凭据，不依赖它的随机性完成认证。
  write("localStorage", logoutNoticeKey, notice);
}
