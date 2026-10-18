import { useI18n } from "../i18n/LanguageContext";
import { Link, useNavigate } from "react-router-dom";
import { useSession } from "../context/SessionContext";
import { money } from "../lib/billing";
import Brand from "./ui/Brand";
import Icon from "./ui/Icon";
import ThemeControl from "./ui/ThemeControl";

export default function LandingPage() {
  const { t, locale } = useI18n();
  const { user, isDemo, startDemo } = useSession();
  const navigate = useNavigate();
  return (
    <div className="landing-page">
      <header className="public-header">
        <Brand />
        <div className="public-actions">
          <ThemeControl compact />
          {user ? (
            <Link className="button primary" to="/home/homepage">
              {t("nav.enter")}
              <Icon name="arrow" />
            </Link>
          ) : (
            <>
              <Link className="text-link" to="/login">
                {t("auth.login")}
              </Link>
              <Link className="button primary" to="/register">
                {t("auth.register")}
                <Icon name="arrow" />
              </Link>
            </>
          )}
        </div>
      </header>
      <main className="landing-main">
        <section className="landing-hero">
          <h1>{t("landing.minimalTitle")}</h1>
          <div className="hero-actions">
            <button
              className="button primary"
              onClick={() => {
                if (!user && !isDemo) startDemo();
                navigate("/home/homepage");
              }}
            >
              {user
                ? t("nav.enter")
                : isDemo
                  ? t("demo.continue")
                  : t("demo.start")}
              <Icon name="arrow" />
            </button>
            {!user && (
              <Link className="button secondary" to="/register">
                {t("landing.create")}
              </Link>
            )}
          </div>
        </section>
        <section
          className="landing-preview"
          aria-label={t("landing.previewAria")}
        >
          <div className="preview-window">
            <span />
            <span />
            <span />
            <span className="preview-sample">{t("landing.preview")}</span>
          </div>
          <div className="landing-preview-body">
            <div className="mini-sidebar">
              <span className="brand-mark" aria-hidden="true">
                <i />
                <i />
                <i />
              </span>
              <Icon name="overview" />
              <Icon name="bills" />
              <Icon name="wallet" />
            </div>
            <div className="mini-dashboard">
              <div className="mini-heading">
                <span>{t("nav.overview")}</span>
                <span className="mini-add">＋</span>
              </div>
              <div className="mini-stats">
                <div>
                  <small>{t("landing.monthBills")}</small>
                  <strong>{money(124000)}</strong>
                </div>
                <div>
                  <small>{t("bills.spending")}</small>
                  <strong>{money(86000)}</strong>
                </div>
              </div>
              <div className="mini-chart">
                <div>
                  <strong>{t("chart.title")}</strong>
                </div>
                <div className="mini-bars">
                  {[48, 67, 55, 83, 63, 74].map((height, index) => (
                    <i key={index} style={{ height: `${height}%` }}>
                      <span />
                    </i>
                  ))}
                </div>
                <div className="mini-months">
                  {[4, 5, 6, 7, 8, 9].map((month) => (
                    <span key={month}>
                      {new Intl.DateTimeFormat(locale, {
                        month: "short",
                      }).format(new Date(2026, month, 1))}
                    </span>
                  ))}
                </div>
              </div>
              <div className="mini-bill">
                <span className="vendor-icon">N</span>
                <div>
                  <strong>Netflix</strong>
                </div>
                <span className="status completed">{t("status.paid")}</span>
                <strong>{money(1549)}</strong>
              </div>
            </div>
          </div>
        </section>
      </main>
      <footer className="public-footer">
        <span>© {new Date().getFullYear()} LedgerNest</span>
      </footer>
    </div>
  );
}
