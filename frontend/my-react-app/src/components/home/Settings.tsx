import { useNavigate } from "react-router-dom";
import { useI18n } from "../../i18n/LanguageContext";
import { useSession } from "../../context/SessionContext";
import { languages, languagePreference } from "../../i18n/core";
import type { Locale } from "../../i18n/core";
import ThemeControl from "../ui/ThemeControl";
import PageHeader from "../ui/PageHeader";
import Panel from "../ui/Panel";
import InfoDialog from "../ui/InfoDialog";
import { IconButton } from "../ui/IconAction";
import Dropdown from "../ui/Dropdown";

export default function Settings() {
  const { t, locale, preference, setPreference } = useI18n();
  const { user, isDemo, signingOut, signOut } = useSession();
  const navigate = useNavigate();
  return (
    <>
      <PageHeader title={t("nav.settings")} />
      <div className="settings-stack">
        <Panel
          title={t("language.title")}
          icon="language"
          className="settings-panel"
          actions={
            <InfoDialog title={t("language.title")}>
              <p>{t("language.description")}</p>
              <p>{t("language.systemNote")}</p>
            </InfoDialog>
          }
        >
          <div className="language-setting">
            <Dropdown
              label={t("language.title")}
              value={preference}
              onChange={(value) => setPreference(languagePreference(value))}
              options={[
                { value: "system", label: t("common.system") },
                ...(Object.keys(languages) as Locale[]).map((code) => ({
                  value: code,
                  label: languages[code].nativeName,
                  lang: code,
                })),
              ]}
            />
          </div>
          <p className="sr-only" role="status">
            {t("language.current", { language: languages[locale].nativeName })}
          </p>
        </Panel>
        <Panel
          title={t("settings.appearance")}
          icon="sun"
          className="settings-panel"
          actions={
            <InfoDialog title={t("settings.appearance")}>
              <p>{t("settings.appearanceNote")}</p>
              <p>{t("settings.systemTheme")}</p>
            </InfoDialog>
          }
        >
          <ThemeControl />
        </Panel>
        <Panel
          title={t("device.profile")}
          icon="user"
          className="settings-panel"
          actions={
            <InfoDialog title={t("device.profile")}>
              <p>{t("device.systemProtection")}</p>
            </InfoDialog>
          }
        >
          <dl className="detail-list">
            <div>
              <dt>{t("field.username")}</dt>
              <dd>{isDemo ? t("demo.user") : user?.username}</dd>
            </div>
          </dl>
          <p className="settings-device-note">{t("device.systemProtection")}</p>
        </Panel>
        <Panel
          title={t("settings.payments")}
          icon="wallet"
          className="settings-panel"
          actions={
            <InfoDialog title={t("settings.payments")}>
              <p>{t("settings.paymentsNote")}</p>
            </InfoDialog>
          }
        >
          <div className="reserved-settings">
            <span>{t("accounts.binding")}</span>
            <span className="soon-tag">{t("common.pendingIntegration")}</span>
            <IconButton icon="plus" label={t("accounts.link")} disabled />
          </div>
          <div className="reserved-settings">
            <span>{t("accounts.methods")}</span>
            <span className="soon-tag">{t("common.pendingIntegration")}</span>
            <IconButton icon="plus" label={t("accounts.addMethod")} disabled />
          </div>
        </Panel>
        <Panel
          title={isDemo ? t("demo.end") : t("auth.logout")}
          icon="logout"
          className="settings-panel logout-panel"
          actions={
            <IconButton
              icon="logout"
              className="danger-action"
              disabled={signingOut}
              aria-busy={signingOut}
              label={
                signingOut
                  ? t("auth.signingOut")
                  : isDemo
                    ? t("demo.exit")
                    : t("auth.logout")
              }
              onClick={async () => {
                if (await signOut()) navigate("/");
              }}
            />
          }
        >
          <span className="sr-only">
            {isDemo ? t("demo.endNote") : t("auth.logoutNote")}
          </span>
        </Panel>
      </div>
    </>
  );
}
