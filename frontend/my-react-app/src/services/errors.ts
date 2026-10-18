import { isAxiosError } from "axios";
import { backendMessage } from "../i18n/backendMessages.ts";
import { ValidationError, hasUnsafeControls } from "../security/validation.ts";

class BackendFailure {
  readonly status: number;
  readonly message: string;
  constructor(status: number, message: string) {
    this.status = status;
    this.message = message;
  }
}
/** 只保留可展示的消息描述；不得把包含密码、Cookie 或请求体的 AxiosError 放入 React 状态。 */
export function captureError(error: unknown): ValidationError | BackendFailure {
  if (error instanceof ValidationError || error instanceof BackendFailure)
    return error;
  if (isAxiosError(error)) {
    if (error.code === "ECONNABORTED" || error.code === "ETIMEDOUT")
      return new ValidationError("api.timeout");
    if (!error.response)
      return new ValidationError(
        error.config?.url === "/bills" && error.config.method === "post"
          ? "api.saveUncertain"
          : "api.network",
      );
    if (error.response.status >= 500)
      return new ValidationError("api.unavailable");
    if (error.response.status === 429) {
      const delay = Number(error.response.headers["retry-after"]);
      return Number.isInteger(delay) && delay > 0 && delay <= 900
        ? new ValidationError("api.retryAfter", { seconds: delay })
        : new ValidationError("api.rateLimit");
    }
    const message: unknown = error.response.data?.message;
    if (
      typeof message === "string" &&
      message.length <= 200 &&
      !hasUnsafeControls(message)
    )
      return new BackendFailure(error.response.status, message);
    return new ValidationError("api.statusFailure", {
      status: error.response.status,
    });
  }
  // 未知异常、堆栈和内部配置不展示、不长期留在界面状态里。
  return new ValidationError("api.failure");
}
export function errorMessage(error: unknown) {
  const failure = captureError(error);
  return failure instanceof ValidationError
    ? failure.localizedMessage()
    : backendMessage(failure.message, failure.status);
}
