import { useI18n } from "../i18n/LanguageContext";
import type { ReactNode } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { useSession } from "../context/SessionContext";

/** 只控制前端访问体验；真正的账号权限必须由后端认证与授权保证。 */
export default function RequiredAuth({ children }: { children: ReactNode }) {
  const { t } = useI18n();
  const { user, isDemo, sessionLoading } = useSession();
  const location = useLocation();
  if (sessionLoading) return <p role="status">{t("auth.verifying")}</p>;
  return user || isDemo ? (
    children
  ) : (
    <Navigate to="/login" state={{ from: location }} replace />
  );
}
