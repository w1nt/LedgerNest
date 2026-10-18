import { useI18n } from "../../i18n/LanguageContext";
import type { ReactNode } from "react";
import Brand from "../ui/Brand";
import ThemeControl from "../ui/ThemeControl";
import Icon from "../ui/Icon";
export default function AuthLayout({ children }: { children: ReactNode }) {
  const { t } = useI18n();
  return (
    <div className="auth-page">
      <header className="public-header">
        <Brand />
        <ThemeControl compact />
      </header>
      <main className="auth-layout">
        <aside className="auth-story">
          <h1>{t("landing.minimalTitle")}</h1>
          <div className="auth-art" aria-hidden="true">
            <div className="art-orbit" />
            <div className="art-card">
              <span className="art-check">
                <Icon name="check" />
              </span>
              <div className="art-lines">
                <i />
                <i />
                <i />
              </div>
            </div>
            <span className="art-dot one" />
            <span className="art-dot two" />
          </div>
        </aside>
        <section className="auth-content">{children}</section>
      </main>
    </div>
  );
}
