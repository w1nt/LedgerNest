import { useI18n } from "../i18n/LanguageContext";
import type { ReactNode } from "react";
import { Navigate } from "react-router-dom";
import { useSession } from "../context/SessionContext";
export default function PublicOnly({ children }: { children: ReactNode }) {
  const { t } = useI18n();
  const { user, sessionLoading } = useSession();
  if (sessionLoading) return <p role="status">{t("auth.verifying")}</p>;
  // 演示用户仍需要登录入口；只有经后端验证的真实账号才跳过登录/注册页。
  return user ? <Navigate to="/home/homepage" replace /> : children;
}
