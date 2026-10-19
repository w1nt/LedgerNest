import { useEffect, useState } from "react";
import { Link, Outlet, useLocation, useNavigate } from "react-router-dom";
import { useI18n } from "../../i18n/LanguageContext";
import BillsProvider from "../../context/BillsProvider";
import { useBills } from "../../context/BillsContext";
import { useSession } from "../../context/SessionContext";
import { cents } from "../../lib/billing";
import type { Bill } from "../../types/billing";
import Brand from "../ui/Brand";
import Icon from "../ui/Icon";
import { IconButton, IconLink } from "../ui/IconAction";
import ThemeControl from "../ui/ThemeControl";
import Modal from "../ui/Modal";
import SearchField from "../ui/SearchField";
import BillListItem from "../ui/BillListItem";
import BillDetails from "../ui/BillDetails";

// 父路由只挂载一次数据层；切页的轻量入场动画不会重建登录会话与账单状态。
export default function AppShell() {
  const { user, isDemo } = useSession();
  return (
    <BillsProvider key={isDemo ? "demo" : user?.id}>
      <ShellContent />
    </BillsProvider>
  );
}
function ShellContent() {
  const { t } = useI18n();
  const { user, isDemo, signingOut, sessionError, signOut } = useSession();
  const { bills, loading, error } = useBills();
  const [popup, setPopup] = useState<
    "notifications" | "help" | "profile" | null
  >(null);
  const [selectedBill, setSelectedBill] = useState<Bill | null>(null);
  const [navOpen, setNavOpen] = useState(false);
  const [search, setSearch] = useState("");
  const navigate = useNavigate();
  const location = useLocation();
  useEffect(() => {
    if (!navOpen) return;
    const trigger = document.activeElement;
    document.querySelector<HTMLElement>(".sidebar nav a")?.focus();
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setNavOpen(false);
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => {
      window.removeEventListener("keydown", closeOnEscape);
      if (trigger instanceof HTMLElement && trigger.isConnected)
        trigger.focus();
    };
  }, [navOpen]);
  const outstanding = bills
    .filter(
      (bill) =>
        bill.settlementStatus !== "voided" && cents(bill.remainingAmount) > 0,
    )
    .sort((a, b) => Date.parse(a.dueAt) - Date.parse(b.dueAt));
  const name = isDemo ? t("demo.user") : user?.username || t("profile.user");
  return (
    <div className={`app-shell ${navOpen ? "nav-open" : ""}`}>
      <a className="skip-link" href="#main-content">
        {t("nav.skip")}
      </a>
      {navOpen && (
        <button
          className="nav-backdrop"
          aria-label={t("nav.close")}
          onClick={() => setNavOpen(false)}
        />
      )}
      <aside
        className="sidebar"
        id="workspace-navigation"
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            setNavOpen(false);
            document
              .querySelector<HTMLButtonElement>(
                '[aria-controls="workspace-navigation"]',
              )
              ?.focus();
          }
        }}
      >
        <Brand compact />
        <nav aria-label={t("nav.main")} onClick={() => setNavOpen(false)}>
          <IconLink
            to="/home/homepage"
            icon="overview"
            label={t("nav.overview")}
            side="right"
          />
          <IconLink
            to="/home/bills"
            icon="bills"
            label={t("nav.bills")}
            side="right"
          />
          {/* 占位入口仍不创建 Route；可通过悬停了解不可用原因。 */}
          <IconButton
            icon="chart"
            label={`${t("nav.analysis")} · ${t("common.comingSoon")}`}
            side="right"
            disabled
          />
          <IconButton
            icon="wallet"
            label={`${t("accounts.link")} · ${t("common.comingSoon")}`}
            side="right"
            disabled
          />
        </nav>
        <div className="sidebar-bottom">
          <IconLink
            to="/home/settings"
            icon="settings"
            label={t("nav.settings")}
            side="right"
            onClick={() => setNavOpen(false)}
          />
          <IconButton
            icon="help"
            label={t("nav.help")}
            side="right"
            onClick={() => {
              setPopup("help");
              setNavOpen(false);
            }}
          />
        </div>
      </aside>
      <div className="app-body">
        <header className="topbar">
          <div className="topbar-search">
            <span className="mobile-menu">
              <IconButton
                icon="menu"
                label={t("nav.open")}
                aria-expanded={navOpen}
                aria-controls="workspace-navigation"
                onClick={() => setNavOpen(true)}
              />
            </span>
            <form
              className="global-search"
              role="search"
              onSubmit={(event) => {
                event.preventDefault();
                navigate(`/home/bills?q=${encodeURIComponent(search.trim())}`);
              }}
            >
              <SearchField
                label={t("nav.searchAria")}
                maxLength={600}
                placeholder={t("nav.search")}
                value={search}
                onChange={(event) => setSearch(event.target.value)}
              />
            </form>
          </div>
          <div className="topbar-actions">
            {isDemo && (
              <div className="demo-indicator">
                <span>{t("demo.label")}</span>
                <IconButton
                  icon="logout"
                  label={t("demo.realLogin")}
                  disabled={signingOut}
                  onClick={async () => {
                    if (!signingOut && (await signOut())) navigate("/login");
                  }}
                />
              </div>
            )}
            <ThemeControl compact />
            <IconButton
              icon="bell"
              label={t("notifications.open")}
              indicator={!loading && !error && outstanding.length > 0}
              onClick={() => setPopup("notifications")}
            />
            <IconButton
              icon="user"
              label={t("profile.open")}
              className="profile-action"
              onClick={() => setPopup("profile")}
            />
          </div>
        </header>
        <main id="main-content" className="main-content">
          {/* 只按 pathname 入场；查询筛选和语言变化不会重新挂载当前页面。 */}
          <div className="page-transition" key={location.pathname}>
            <Outlet />
          </div>
        </main>
      </div>
      {popup === "profile" && (
        <Modal title={t("device.profile")} onClose={() => setPopup(null)}>
          <div className="profile-summary">
            <span className="avatar large">{name.slice(0, 1)}</span>
            <h3>{name}</h3>
            <p>{isDemo ? t("demo.active") : t("device.systemProtection")}</p>
          </div>
          <dl className="detail-list">
            <div>
              <dt>{t("profile.space")}</dt>
              <dd>{t("nav.space")}</dd>
            </div>
          </dl>
          {sessionError && (
            <p className="form-error" role="alert">
              {sessionError}
            </p>
          )}
          <div className="modal-actions">
            <Link
              className="button secondary"
              to="/home/settings"
              onClick={() => setPopup(null)}
            >
              {t("nav.settings")}
            </Link>
            <button
              className="button primary"
              disabled={signingOut}
              onClick={async () => {
                if (await signOut()) navigate("/");
              }}
            >
              <Icon name="logout" />
              {signingOut
                ? t("auth.signingOut")
                : isDemo
                  ? t("demo.exit")
                  : t("auth.logout")}
            </button>
          </div>
        </Modal>
      )}
      {popup === "notifications" && (
        <Modal title={t("notifications.title")} onClose={() => setPopup(null)}>
          {loading ? (
            <p className="muted">{t("bills.loading")}</p>
          ) : error ? (
            <p className="form-error">{error}</p>
          ) : outstanding.length ? (
            <>
              <div className="bill-list">
                {outstanding.map((bill) => (
                  <BillListItem
                    key={bill.id}
                    bill={bill}
                    onSelect={setSelectedBill}
                  />
                ))}
              </div>
              <div className="modal-actions">
                <Link
                  to="/home/bills?status=outstanding"
                  className="button secondary"
                  onClick={() => setPopup(null)}
                >
                  {t("bills.viewOutstanding")}
                  <Icon name="arrow" />
                </Link>
              </div>
            </>
          ) : (
            <div className="empty-state">
              <Icon name="check" />
              <h3>{t("bills.noneOutstanding")}</h3>
            </div>
          )}
        </Modal>
      )}
      {popup === "help" && (
        <Modal title={t("nav.help")} onClose={() => setPopup(null)}>
          <div className="help-content">
            <p>{t("help.overview")}</p>
            <p>{t("help.bills")}</p>
            <p>{t("help.create")}</p>
            <p>{t("help.settings")}</p>
            <p className="muted">{t("help.integration")}</p>
          </div>
        </Modal>
      )}
      {selectedBill && (
        <BillDetails
          bill={selectedBill}
          onClose={() => setSelectedBill(null)}
        />
      )}
    </div>
  );
}
