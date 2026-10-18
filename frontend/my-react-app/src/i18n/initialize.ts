import { languagePreference, updateLanguage } from "./core";
import { savedLanguage } from "../security/storage";

/** 入口在渲染前调用，避免首屏语言与已保存的偏好不一致。 */
export function initializeLanguage() {
  updateLanguage(languagePreference(savedLanguage()));
}
