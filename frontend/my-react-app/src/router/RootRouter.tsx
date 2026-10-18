import { useI18n } from "../i18n/LanguageContext";
import { useEffect } from "react";
import {
  BrowserRouter,
  Navigate,
  Route,
  Routes,
  useLocation,
} from "react-router-dom";
import { useSession } from "../context/SessionContext";
import RequiredAuth from "./RequiredAuth";
import PublicOnly from "./PublicOnly";
import AppShell from "../components/layout/AppShell";
import HomePage from "../components/home/HomePage";
import BillsPage from "../components/home/BillsPage";
import Settings from "../components/home/Settings";
import CreateBillPage from "../components/home/CreateBillPage";
import Login from "../components/Login";

function SessionRevalidation() {
  const { pathname } = useLocation();
  const { revalidateSession } = useSession();
  // 页面导航时复核已登录会话，避免后端重启或 Cookie 失效后仍展示旧身份。
  useEffect(() => {
    void revalidateSession();
  }, [pathname, revalidateSession]);
  return null;
}

export default function RootRouter() {
  const { t } = useI18n();
  return (
    <BrowserRouter>
      <SessionRevalidation />
      <Routes>
        <Route path="/" element={<PublicOnly><Login /></PublicOnly>} />
        <Route
          path="/login"
          element={
            <PublicOnly>
              <Login />
            </PublicOnly>
          }
        />
        <Route
          path="/register"
          element={
            <PublicOnly>
              <Navigate to="/login" replace />
            </PublicOnly>
          }
        />
        {/* pathless 父路由共享布局与数据；保留原项目已有 URL，方便跟踪前后变化。 */}
        <Route
          element={
            <RequiredAuth>
              <AppShell />
            </RequiredAuth>
          }
        >
          <Route
            path="/home"
            element={<Navigate to="/home/homepage" replace />}
          />
          <Route path="/home/homepage" element={<HomePage />} />
          <Route path="/home/bills" element={<BillsPage />} />
          <Route path="/create-bill" element={<CreateBillPage />} />
          <Route path="/home/settings" element={<Settings />} />
        </Route>
        {/* 待接入的支付、账户和分析入口没有占位路由。未知路径提供可用返回入口。 */}
        <Route
          path="*"
          element={
            <div className="not-found">
              <span className="eyebrow">404</span>
              <h1>{t("notFound.title")}</h1>
              <a className="button primary" href="/">
                {t("nav.home")}
              </a>
            </div>
          }
        />
      </Routes>
    </BrowserRouter>
  );
}
