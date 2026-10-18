import { currentLocale, t } from "./core.ts";
import type { MessageKey } from "./types.ts";

/** 后端当前只有 message，没有稳定错误码；此处仅映射已知协议文案，不翻译用户数据。
 * 后续有 code 字段时，应按错误码查语言资源，并逐步移除文本匹配。
 */
const messageKeys: Readonly<Record<string, MessageKey>> = {
  "邮箱或密码不正确。": "api.invalidCredentials",
  "邮箱或密码错误。": "api.invalidCredentials",
  "邮箱已被注册。": "api.emailRegistered",
  "该邮箱已被注册。": "api.emailRegistered",
  "请先登录。": "api.unauthorized",
  "登录已失效，请重新登录。": "session.expired",
  "登录状态已失效，请重新登录。": "session.expired",
  "请输入有效的邮箱。": "validation.email",
  "密码长度须为 8 至 128 位。": "validation.password",
  "两次输入的密码不一致。": "validation.passwordMatch",
  "请求过于频繁，请稍后重试。": "api.rateLimit",
};
export function backendMessage(message: string, status: number) {
  if (Object.hasOwn(messageKeys, message)) return t(messageKeys[message]);
  if (status === 401) return t("api.unauthorized");
  if (status === 403) return t("api.forbidden");
  // 不猜测未知服务端句子的含义；英文界面用本地的安全兜底说明。
  return currentLocale() === "zh-CN"
    ? message
    : t("api.statusFailure", { status });
}
