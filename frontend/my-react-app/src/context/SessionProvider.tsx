import { useI18n } from "../i18n/LanguageContext";
import {
  startTransition,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import type { ReactNode } from "react";
import { isCancel } from "axios";
import { isUnauthorized } from "../services/errors";
import type { User } from "../types/billing";
import {
  getCurrentUser,
  logout,
  captureError,
  errorMessage,
  onSessionUnauthorized,
  unlockDevice as requestDeviceUnlock,
} from "../services/api";
import { ValidationError } from "../security/validation";
import { SessionContext } from "./SessionContext";
import {
  announceLogout,
  logoutNoticeKey,
  removeLegacyUser,
  savedDemo,
  saveDemo,
} from "../security/storage";

export default function SessionProvider({ children }: { children: ReactNode }) {
  useI18n(); // 语言切换仅更新展示，不重新验证会话。
  // 演示标记只允许体验示例账单，不等同于经过 Cookie 会话验证的真实账号。
  const initialDemo = useRef(savedDemo());
  const [user, setUser] = useState<User | null>(null);
  const [isDemo, setDemo] = useState(initialDemo.current);
  const [sessionLoading, setSessionLoading] = useState(!initialDemo.current);
  const [signingOut, setSigningOut] = useState(false);
  const [failure, setSessionError] = useState<unknown>(null);
  const sessionError = failure ? errorMessage(failure) : "";
  const verifiedUser = useRef<User | null>(null);
  const verification = useRef<AbortController | null>(null);
  const revision = useRef(0);
  const logoutRequest = useRef<Promise<boolean> | null>(null);

  const clearSession = useCallback((message: unknown = null) => {
    revision.current++;
    verification.current?.abort();
    if (verifiedUser.current) announceLogout();
    verifiedUser.current = null;
    removeLegacyUser();
    saveDemo(false);
    setSessionError(message ? captureError(message) : null);
    setSessionLoading(false);
    setUser(null);
    setDemo(false);
  }, []);

  useEffect(
    () =>
      onSessionUnauthorized(() => {
        // 登录请求的凭据错误不会触发此通知；只在受保护接口的会话失效时撤销身份。
        clearSession(
          verifiedUser.current && !logoutRequest.current
            ? new ValidationError("session.expired")
            : "",
        );
      }),
    [clearSession],
  );

  useEffect(() => {
    removeLegacyUser();
    if (initialDemo.current) return;
    const controller = new AbortController();
    verification.current = controller;
    const attempt = revision.current;
    // 展示缓存不能作为身份凭证；只接受 /me 返回的服务端会话。
    getCurrentUser(controller.signal)
      .then((next) => {
        if (controller.signal.aborted || attempt !== revision.current) return;
        verifiedUser.current = next;
        setUser(next);
      })
      .catch((error: unknown) => {
        if (
          controller.signal.aborted ||
          attempt !== revision.current ||
          isCancel(error)
        )
          return;
        clearSession(isUnauthorized(error) ? "" : error);
      })
      .finally(() => {
        if (!controller.signal.aborted && attempt === revision.current)
          setSessionLoading(false);
      });
    return () => controller.abort();
  }, [clearSession]);

  const revalidateSession = useCallback(async () => {
    if (!verifiedUser.current || logoutRequest.current) return;
    verification.current?.abort();
    const controller = new AbortController();
    verification.current = controller;
    const attempt = revision.current;
    try {
      const next = await getCurrentUser(controller.signal);
      if (controller.signal.aborted || attempt !== revision.current) return;
      verifiedUser.current = next;
      setUser(next);
      setSessionError("");
    } catch (error) {
      if (
        controller.signal.aborted ||
        attempt !== revision.current ||
        isCancel(error)
      )
        return;
      // 401 由统一通知撤销身份；网络错误不等同于会话失效，不凭空退出账号。
      setSessionError(captureError(error));
    }
  }, []);

  useEffect(() => {
    const check = () => {
      if (document.visibilityState === "visible") void revalidateSession();
    };
    window.addEventListener("focus", check);
    window.addEventListener("pageshow", check);
    document.addEventListener("visibilitychange", check);
    const onLogout = (event: StorageEvent) => {
      if (event.key === logoutNoticeKey && verifiedUser.current)
        clearSession(new ValidationError("session.otherWindow"));
    };
    window.addEventListener("storage", onLogout);
    return () => {
      window.removeEventListener("focus", check);
      window.removeEventListener("pageshow", check);
      document.removeEventListener("visibilitychange", check);
      window.removeEventListener("storage", onLogout);
      verification.current?.abort();
    };
  }, [revalidateSession, clearSession]);

  function signIn(next: User) {
    // 中断较早的 /me，防止旧的未登录结果覆盖刚完成的登录。
    revision.current++;
    verification.current?.abort();
    verifiedUser.current = next;
    removeLegacyUser();
    saveDemo(false);
    setSessionError("");
    setSessionLoading(false);
    startTransition(() => {
      setDemo(false);
      setUser(next);
    });
  }
  async function unlockDevice(locale: "zh-CN" | "en-US", signal?: AbortSignal) {
    verification.current?.abort();
    const controller = new AbortController(),
      attempt = revision.current;
    verification.current = controller;
    const cancel = () => controller.abort();
    signal?.addEventListener("abort", cancel, { once: true });
    if (signal?.aborted) controller.abort();
    try {
      const next = await requestDeviceUnlock(locale, controller.signal);
      if (controller.signal.aborted || attempt !== revision.current)
        return false;
      signIn(next);
      return true;
    } finally {
      signal?.removeEventListener("abort", cancel);
    }
  }
  function startDemo() {
    revision.current++;
    verification.current?.abort();
    verifiedUser.current = null;
    removeLegacyUser();
    saveDemo(true);
    setSessionError("");
    setSessionLoading(false);
    startTransition(() => {
      setUser(null);
      setDemo(true);
    });
  }
  function signOut(): Promise<boolean> {
    if (logoutRequest.current) return logoutRequest.current;
    const attempt = revision.current;
    setSigningOut(true);
    setSessionError("");
    logoutRequest.current = (async () => {
      try {
        if (!isDemo) await logout();
        if (attempt !== revision.current)
          return verifiedUser.current === null && !savedDemo();
        clearSession();
        return true;
      } catch (error) {
        if (attempt === revision.current) setSessionError(captureError(error));
        return false;
      } finally {
        setSigningOut(false);
      }
    })().finally(() => {
      logoutRequest.current = null;
    });
    return logoutRequest.current;
  }
  return (
    <SessionContext.Provider
      value={{
        user,
        isDemo,
        sessionLoading,
        signingOut,
        sessionError,
        revalidateSession,
        signIn,
        unlockDevice,
        startDemo,
        signOut,
      }}
    >
      {sessionError && (
        <p className="form-error" role="alert">
          {sessionError}
        </p>
      )}
      {children}
    </SessionContext.Provider>
  );
}
