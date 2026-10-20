import { useEffect, useState } from "react";
import type { KeyboardEvent, ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { useI18n } from "../../i18n/LanguageContext";
import { useSession } from "../../context/SessionContext";
import { useExperience } from "../../context/ExperienceContext";
import { languages, languagePreference } from "../../i18n/core";
import {
  getSettings,
  getDeviceStatus,
  saveSecurity,
  removeIntegration,
  captureError,
  errorMessage,
} from "../../services/api";
import { aiProviders, emptySettings } from "../../../../../shared/settings";
import type {
  SettingsSnapshot,
  IntegrationKind,
  IdleMinutes,
} from "../../../../../shared/settings";
import type { DeviceStatus } from "../../../../../shared/desktop";
import type { Locale } from "../../i18n/core";
import ThemeControl from "../ui/ThemeControl";
import PageHeader from "../ui/PageHeader";
import Panel from "../ui/Panel";
import Dropdown from "../ui/Dropdown";
import Icon from "../ui/Icon";
import SecretValue from "../ui/SecretValue";
import SegmentedControl from "../ui/SegmentedControl";
import Modal from "../ui/Modal";
import DataPanel from "./DataPanel";
import IntegrationDialog from "./IntegrationDialog";
const tabs = [
  { id: "general", key: "config.general", icon: "sun" },
  { id: "connections", key: "config.connections", icon: "link" },
  { id: "security", key: "config.security", icon: "shield" },
  { id: "data", key: "config.data", icon: "download" },
] as const;
type Tab = (typeof tabs)[number]["id"];
function Row({
  title,
  note,
  children,
}: {
  title: string;
  note?: string;
  children: ReactNode;
}) {
  return (
    <div className="setting-row">
      <div className="setting-row-label">
        <strong>{title}</strong>
        {note && <p>{note}</p>}
      </div>
      <div className="setting-row-control">{children}</div>
    </div>
  );
}
export default function Settings() {
  const { t, preference, setPreference } = useI18n(),
    { user, isDemo, signingOut, signOut } = useSession(),
    { experience, update } = useExperience();
  const navigate = useNavigate();
  const [refresh, setRefresh] = useState(0);
  const [tab, setTab] = useState<Tab>("general"),
    [settings, setSettings] = useState<SettingsSnapshot | null>(
      isDemo ? emptySettings() : null,
    ),
    [device, setDevice] = useState<DeviceStatus | null>(null),
    [failure, setFailure] = useState<unknown>(null),
    [busy, setBusy] = useState(false),
    [notice, setNotice] = useState(false);
  const [editing, setEditing] = useState<IntegrationKind | null>(null),
    [removing, setRemoving] = useState<IntegrationKind | null>(null);
  useEffect(() => {
    let active = true;
    if (!isDemo)
      getSettings()
        .then((value) => {
          if (active) setSettings(value);
        })
        .catch((error) => {
          if (active) setFailure(captureError(error));
        });
    getDeviceStatus()
      .then((value) => {
        if (active) setDevice(value);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [isDemo, refresh]);
  const value = settings || emptySettings(),
    editable = !isDemo && settings !== null;
  function saved(next: SettingsSnapshot) {
    setSettings(next);
    setNotice(true);
    setFailure(null);
  }
  async function security(minutes: IdleMinutes) {
    if (!editable || busy) return;
    setBusy(true);
    setNotice(false);
    try {
      saved(await saveSecurity(minutes));
    } catch (error) {
      setFailure(captureError(error));
    } finally {
      setBusy(false);
    }
  }
  async function remove() {
    if (!removing || busy) return;
    setBusy(true);
    try {
      saved(await removeIntegration(removing));
      setRemoving(null);
    } catch (error) {
      setFailure(captureError(error));
    } finally {
      setBusy(false);
    }
  }
  function move(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    if (
      ![
        "ArrowDown",
        "ArrowUp",
        "ArrowLeft",
        "ArrowRight",
        "Home",
        "End",
      ].includes(event.key)
    )
      return;
    event.preventDefault();
    const next =
      event.key === "Home"
        ? 0
        : event.key === "End"
          ? tabs.length - 1
          : (index +
              (["ArrowUp", "ArrowLeft"].includes(event.key) ? -1 : 1) +
              tabs.length) %
            tabs.length;
    setTab(tabs[next].id);
    document.getElementById("setting-tab-" + tabs[next].id)?.focus();
  }
  const aiName =
    value.ai.provider === "custom"
      ? t("config.customProvider")
      : aiProviders[value.ai.provider].name;
  return (
    <div className="settings-page">
      <PageHeader
        title={t("nav.settings")}
        actions={
          <span className="settings-local-badge">
            <Icon name="shield" />
            {t("config.localOnly")}
          </span>
        }
      />
      <p className="settings-intro">{t("config.intro")}</p>
      <div className="settings-layout">
        <aside className="settings-rail">
          <div
            className="settings-tabs"
            role="tablist"
            aria-label={t("nav.settings")}
          >
            {tabs.map((item, index) => (
              <button
                type="button"
                role="tab"
                key={item.id}
                id={"setting-tab-" + item.id}
                aria-selected={tab === item.id}
                aria-controls="settings-content"
                tabIndex={tab === item.id ? 0 : -1}
                onKeyDown={(event) => move(event, index)}
                onClick={() => setTab(item.id)}
              >
                <Icon name={item.icon} />
                {t(item.key)}
                <Icon name="chevron" />
              </button>
            ))}
          </div>
          <div className="settings-rail-note">
            <Icon name="lock" />
            <span>{t("config.railNote")}</span>
          </div>
          <p className="settings-version">
            LedgerNest <span>{__APP_VERSION__}</span>
          </p>
        </aside>
        <div
          className="settings-content"
          role="tabpanel"
          id="settings-content"
          aria-labelledby={"setting-tab-" + tab}
        >
          {isDemo && (
            <div className="settings-banner">
              <Icon name="help" />
              <span>{t("config.demoNote")}</span>
            </div>
          )}
          {failure != null && (
            <div className="settings-read-error">
              <p className="form-error" role="alert">
                {errorMessage(failure)}
              </p>
              <button
                type="button"
                className="button secondary"
                disabled={busy}
                onClick={() => {
                  setFailure(null);
                  setSettings(null);
                  setRefresh((current) => current + 1);
                }}
              >
                {t("config.retry")}
              </button>
            </div>
          )}
          {!isDemo && settings === null && failure == null && (
            <p className="settings-section-note" role="status">
              {t("config.loading")}
            </p>
          )}
          {notice && (
            <p className="settings-save-notice" role="status">
              <Icon name="check" />
              {t("config.savedNotice")}
            </p>
          )}
          <div className="settings-tab-content" key={tab}>
            {tab === "general" && (
              <>
                <Panel
                  title={t("config.experience")}
                  icon="sun"
                  className="settings-panel"
                >
                  <Row
                    title={t("settings.appearance")}
                    note={t("config.themeNote")}
                  >
                    <ThemeControl />
                  </Row>
                  <Row
                    title={t("language.title")}
                    note={t("language.systemNote")}
                  >
                    <Dropdown
                      label={t("language.title")}
                      value={preference}
                      onChange={(value) =>
                        setPreference(languagePreference(value))
                      }
                      options={[
                        { value: "system", label: t("common.system") },
                        ...(Object.keys(languages) as Locale[]).map((code) => ({
                          value: code,
                          label: languages[code].nativeName,
                          lang: code,
                        })),
                      ]}
                    />
                  </Row>
                  <Row
                    title={t("config.density")}
                    note={t("config.densityNote")}
                  >
                    <SegmentedControl
                      label={t("config.density")}
                      value={experience.density}
                      onChange={(density) => update({ density })}
                      options={[
                        {
                          value: "comfortable",
                          label: t("config.comfortable"),
                        },
                        { value: "compact", label: t("config.compact") },
                      ]}
                    />
                  </Row>
                  <Row title={t("config.motion")} note={t("config.motionNote")}>
                    <Dropdown
                      label={t("config.motion")}
                      value={experience.motion}
                      onChange={(motion) => update({ motion })}
                      options={[
                        { value: "system", label: t("config.motionSystem") },
                        { value: "reduce", label: t("config.motionReduce") },
                      ]}
                    />
                  </Row>
                </Panel>
                <Panel
                  title={t("device.profile")}
                  icon="user"
                  className="settings-panel"
                >
                  <Row
                    title={t("field.username")}
                    note={t("device.systemProtection")}
                  >
                    <span className="settings-profile-name">
                      {isDemo ? t("demo.user") : user?.username}
                    </span>
                  </Row>
                  <p className="settings-section-note">
                    {t("config.profileNote")}
                  </p>
                </Panel>
              </>
            )}
            {tab === "connections" && (
              <>
                <div className="settings-banner">
                  <Icon name="link" />
                  <span>{t("config.integrationNote")}</span>
                </div>
                <Panel
                  title="Plaid"
                  icon="wallet"
                  className="settings-panel integration-panel"
                  actions={
                    <span
                      className={`config-badge ${value.plaid.configured ? "stored" : ""}`}
                    >
                      {t(
                        value.plaid.configured
                          ? "config.stored"
                          : "config.notConfigured",
                      )}
                    </span>
                  }
                >
                  <p className="integration-description">
                    {t("config.plaidDescription")}
                  </p>
                  <dl className="integration-details">
                    <div>
                      <dt>{t("config.environment")}</dt>
                      <dd>
                        {value.plaid.environment === "production"
                          ? "Trial / Production"
                          : "Sandbox"}
                      </dd>
                    </div>
                    <div>
                      <dt>Client ID</dt>
                      <dd>
                        <SecretValue value={value.plaid.clientId} />
                      </dd>
                    </div>
                    <div>
                      <dt>Secret</dt>
                      <dd>
                        <SecretValue value={value.plaid.secret} />
                      </dd>
                    </div>
                  </dl>
                  <div className="integration-footer">
                    <span>
                      <Icon name="clock" />
                      {t("config.bankPending")}
                    </span>
                    <div>
                      {value.plaid.configured && (
                        <button
                          type="button"
                          className="button danger subtle"
                          disabled={!editable || busy}
                          onClick={() => setRemoving("plaid")}
                        >
                          {t("config.remove")}
                        </button>
                      )}
                      <button
                        type="button"
                        className="button secondary"
                        data-testid="configure-plaid"
                        disabled={!editable || busy}
                        onClick={() => {
                          setNotice(false);
                          setEditing("plaid");
                        }}
                      >
                        <Icon name="settings" />
                        {t(
                          value.plaid.configured
                            ? "config.edit"
                            : "config.configure",
                        )}
                      </button>
                    </div>
                  </div>
                </Panel>
                <Panel
                  title={t("config.aiTitle")}
                  icon="sparkles"
                  className="settings-panel integration-panel"
                  actions={
                    <span
                      className={`config-badge ${value.ai.configured ? "stored" : ""}`}
                    >
                      {t(
                        value.ai.configured
                          ? "config.stored"
                          : "config.optional",
                      )}
                    </span>
                  }
                >
                  <p className="integration-description">
                    {t("config.aiDescription")}
                  </p>
                  <dl className="integration-details">
                    <div>
                      <dt>{t("config.provider")}</dt>
                      <dd>{aiName}</dd>
                    </div>
                    <div>
                      <dt>{t("config.model")}</dt>
                      <dd>{value.ai.model || t("config.notSet")}</dd>
                    </div>
                    <div>
                      <dt>API Key</dt>
                      <dd>
                        <SecretValue value={value.ai.apiKey} />
                      </dd>
                    </div>
                  </dl>
                  <div className="integration-footer">
                    <span>
                      <Icon name="clock" />
                      {t("config.aiPending")}
                    </span>
                    <div>
                      {value.ai.configured && (
                        <button
                          type="button"
                          className="button danger subtle"
                          disabled={!editable || busy}
                          onClick={() => setRemoving("ai")}
                        >
                          {t("config.remove")}
                        </button>
                      )}
                      <button
                        type="button"
                        className="button secondary"
                        data-testid="configure-ai"
                        disabled={!editable || busy}
                        onClick={() => {
                          setNotice(false);
                          setEditing("ai");
                        }}
                      >
                        <Icon name="settings" />
                        {t(
                          value.ai.configured
                            ? "config.edit"
                            : "config.configure",
                        )}
                      </button>
                    </div>
                  </div>
                </Panel>
                <p className="settings-section-note">
                  <Icon name="shield" />
                  {t("config.secretPolicy")}
                </p>
              </>
            )}
            {tab === "security" && (
              <>
                <Panel
                  title={t("config.protection")}
                  icon="shield"
                  className="settings-panel"
                >
                  <Row
                    title={t("config.deviceAuth")}
                    note={
                      device?.platform === "windows"
                        ? "Windows Hello"
                        : device?.platform === "macos"
                          ? t("device.macos")
                          : t("device.method")
                    }
                  >
                    <span
                      className={`config-badge ${device?.availability === "available" ? "stored" : ""}`}
                    >
                      {t(
                        device?.availability === "available"
                          ? "config.available"
                          : "config.unavailable",
                      )}
                    </span>
                  </Row>
                  <Row
                    title={t("config.autoLock")}
                    note={t("config.autoLockNote")}
                  >
                    <Dropdown
                      label={t("config.autoLock")}
                      value={String(value.idleMinutes)}
                      onChange={(minutes) =>
                        void security(Number(minutes) as IdleMinutes)
                      }
                      disabled={!editable || busy}
                      options={[5, 10, 15, 30].map((minutes) => ({
                        value: String(minutes),
                        label: t("config.minutes", { count: minutes }),
                      }))}
                    />
                  </Row>
                  <Row
                    title={t("config.encryption")}
                    note={t("config.encryptionNote")}
                  >
                    <span className="config-badge stored">
                      <Icon name="lock" />
                      {t(isDemo ? "config.demoStorage" : "config.encrypted")}
                    </span>
                  </Row>
                </Panel>
                <Panel
                  title={isDemo ? t("demo.end") : t("auth.logout")}
                  icon="lock"
                  className="settings-panel logout-panel"
                >
                  <p className="settings-section-note">
                    {t("auth.logoutNote")}
                  </p>
                  <button
                    type="button"
                    className="button secondary"
                    disabled={signingOut}
                    onClick={async () => {
                      if (await signOut()) navigate("/login");
                    }}
                  >
                    <Icon name="lock" />
                    {t(
                      signingOut
                        ? "auth.signingOut"
                        : isDemo
                          ? "demo.exit"
                          : "auth.logout",
                    )}
                  </button>
                </Panel>
              </>
            )}
            {tab === "data" && (
              <>
                <DataPanel isDemo={isDemo} />
                <Panel
                  title="LedgerNest"
                  icon="overview"
                  className="settings-panel"
                >
                  <Row title={t("config.version")}>
                    <span className="settings-version-number">
                      {__APP_VERSION__}
                    </span>
                  </Row>
                  <p className="settings-section-note">{t("config.about")}</p>
                </Panel>
              </>
            )}
          </div>
        </div>
      </div>
      {editing && settings && (
        <IntegrationDialog
          kind={editing}
          settings={settings}
          onClose={() => setEditing(null)}
          onSaved={saved}
        />
      )}
      {removing && (
        <Modal
          title={t("config.removeTitle")}
          onClose={() => setRemoving(null)}
          preventClose={busy}
        >
          <p className="config-form-note">{t("config.removeNote")}</p>
          <div className="config-dialog-actions">
            <button
              type="button"
              className="button secondary"
              disabled={busy}
              onClick={() => setRemoving(null)}
            >
              {t("config.cancel")}
            </button>
            <button
              type="button"
              className="button danger"
              disabled={busy}
              onClick={() => void remove()}
            >
              {t(busy ? "config.saving" : "config.removeConfirm")}
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}
