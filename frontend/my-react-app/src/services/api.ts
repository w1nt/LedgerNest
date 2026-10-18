import { desktopBridge, desktopResult, DesktopRequestError } from "./desktop";
import axios from "axios";
import type { CreateBillRequest, RegisterRequest } from "../types/billing";
import { apiBase } from "../security/apiBase";
import {
  ValidationError,
  billRequest,
  email,
  password,
  parseBills,
  parseUser,
  registerRequest,
  parseBillPage,
  BILL_PAGE_SIZE,
} from "../security/validation";

function createHttp() {
  const baseURL = apiBase(
    import.meta.env.VITE_API_BASE_URL,
    window.location.origin,
    import.meta.env.DEV,
  );
  const trustedOrigin = new URL(baseURL, window.location.origin).origin;
  const paths = [
    "/login",
    "/register",
    "/me",
    "/logout",
    "/bills",
    "/bills/page",
  ];
  const http = axios.create({
    baseURL,
    timeout: 10000,
    withCredentials: true,
    allowAbsoluteUrls: false,
    // Fetch 禁止自动跟随 30x，避免把密码或写入请求重定向给其他服务。
    adapter: "fetch",
    fetchOptions: {
      redirect: "error",
      cache: "no-store",
      referrerPolicy: "no-referrer",
    },
    headers: {
      Accept: "application/json",
      "X-Requested-With": "XMLHttpRequest",
    },
  });
  http.interceptors.request.use((config) => {
    const destination = new URL(http.getUri(config), window.location.origin);
    if (
      destination.origin !== trustedOrigin ||
      !paths.includes(config.url || "") ||
      !["get", "post"].includes(config.method || "get")
    )
      throw new ValidationError("api.destination");
    return config;
  });

  return http;
}
const http = window.location.protocol === "ledgernest:" ? null : createHttp();
const unauthorizedListeners = new Set<() => void>();
export function onSessionUnauthorized(listener: () => void) {
  unauthorizedListeners.add(listener);
  const detach = desktopBridge()?.onLocked(listener);
  return () => {
    unauthorizedListeners.delete(listener);
    detach?.();
  };
}
http?.interceptors.response.use(
  (response) => {
    if (
      response.status !== 204 &&
      !/^application\/json(?:\s*;|$)/iu.test(
        String(response.headers["content-type"] || ""),
      )
    )
      throw new ValidationError("api.format");
    return response;
  },
  (error: unknown) => {
    if (
      axios.isAxiosError(error) &&
      !error.config?.signal?.aborted &&
      error.response?.status === 401 &&
      !["/login", "/register", "/logout"].includes(error.config?.url || "")
    )
      unauthorizedListeners.forEach((listener) => listener());
    return Promise.reject(error);
  },
);
async function local<T>(
  request: Promise<import("../../../../shared/desktop").Reply<T>>,
  signal?: AbortSignal,
  protectedRequest = true,
) {
  try {
    return await desktopResult(request, signal);
  } catch (error) {
    if (
      !signal?.aborted &&
      protectedRequest &&
      error instanceof DesktopRequestError &&
      error.status === 401
    )
      unauthorizedListeners.forEach((listener) => listener());
    throw error;
  }
}
export async function login(
  value: string,
  secret: string,
  signal?: AbortSignal,
) {
  signal?.throwIfAborted();
  if (desktopBridge())
    throw new DesktopRequestError(
      403,
      "Use device unlock.",
      "AUTH_DESKTOP_REQUIRED",
    );
  const { data } = await http!.post<unknown>(
    "/login",
    { email: email(value), password: password(secret) },
    { signal },
  );
  return parseUser(data);
}
export async function register(value: RegisterRequest, signal?: AbortSignal) {
  signal?.throwIfAborted();
  if (desktopBridge())
    throw new DesktopRequestError(
      403,
      "Use device unlock.",
      "AUTH_DESKTOP_REQUIRED",
    );
  // 显式挑选字段，禁止额外身份、状态、角色等字段经对象展开进入请求。
  const response = await http!.post<unknown>(
    "/register",
    registerRequest(value),
    { signal },
  );
  if (response.status !== 201)
    throw new ValidationError("api.registrationUncertain");
  try {
    parseUser(response.data);
  } catch {
    throw new ValidationError("api.registrationData");
  }
}
export async function getCurrentUser(signal?: AbortSignal) {
  signal?.throwIfAborted();
  if (desktopBridge())
    return parseUser(await local(desktopBridge()!.currentUser(), signal));
  const { data } = await http!.get<unknown>("/me", { signal });
  return parseUser(data);
}
export async function logout() {
  if (desktopBridge()) {
    await local(desktopBridge()!.logout(), undefined, false);
    return;
  }
  const response = await http!.post("/logout");
  if (response.status !== 204) throw new ValidationError("api.logout");
}
export async function getBills(signal?: AbortSignal) {
  // 使用已存在的后端分页接口，避免一次下载无界列表；现有页面仍共用完整快照。
  const items = [];
  let pages = 1,
    total: number | undefined;
  for (let page = 1; page <= pages; page++) {
    signal?.throwIfAborted();
    const { data } = desktopBridge()
      ? { data: await local(desktopBridge()!.billPage({ page }), signal) }
      : await http!.get<unknown>("/bills/page", {
          signal,
          params: { page, size: BILL_PAGE_SIZE, status: "any" },
        });
    const result = parseBillPage(data, page);
    if (
      total !== undefined &&
      (total !== result.total || pages !== result.pages)
    )
      throw new ValidationError("api.listChanged");
    pages = result.pages;
    total = result.total;
    items.push(...result.items);
  }
  return parseBills(items);
}
export async function createBill(
  value: CreateBillRequest,
  idempotencyKey: string,
) {
  if (!/^[A-Za-z0-9_-]{16,128}$/u.test(idempotencyKey))
    throw new ValidationError("api.requestKey");
  if (desktopBridge()) {
    parseBills([
      await local(
        desktopBridge()!.createBill({
          bill: billRequest(value),
          idempotencyKey,
        }),
      ),
    ]);
    return;
  }
  const response = await http!.post<unknown>("/bills", billRequest(value), {
    headers: { "Idempotency-Key": idempotencyKey },
  });
  if (response.status !== 201) throw new ValidationError("api.saveUncertain");
  try {
    parseBills([response.data]);
  } catch {
    throw new ValidationError("api.saveData");
  }
}

export { captureError, errorMessage } from "./errors";

export async function getDeviceStatus(): Promise<
  import("../../../../shared/desktop").DeviceStatus
> {
  const bridge = desktopBridge();
  if (!bridge) return { platform: "unsupported", availability: "unsupported" };
  return await local(bridge.deviceStatus(), undefined, false);
}
export async function unlockDevice(
  locale: "zh-CN" | "en-US",
  signal?: AbortSignal,
) {
  signal?.throwIfAborted();
  const bridge = desktopBridge();
  if (!bridge)
    throw new DesktopRequestError(
      409,
      "Open the desktop app to unlock local data.",
      "AUTH_DESKTOP_REQUIRED",
    );
  return parseUser(await local(bridge.unlock({ locale }), signal, false));
}
