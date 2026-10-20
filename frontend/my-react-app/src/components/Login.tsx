import { useEffect, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useI18n } from "../i18n/LanguageContext";
import { useSession } from "../context/SessionContext";
import {
  getDeviceStatus,
  captureError,
  errorMessage,
  logout,
} from "../services/api";
import type { DeviceStatus } from "../../../../shared/desktop";
import { waitForUnlock } from "../lib/motion";
import { safeReturnPath } from "../security/validation";
import DataDialog from "./home/DataDialog";
import Brand from "./ui/Brand";
import ThemeControl from "./ui/ThemeControl";
import Icon from "./ui/Icon";
export default function Login() {
  const { t, locale, setPreference } = useI18n();
  const { unlockDevice, startDemo } = useSession();
  const navigate = useNavigate(),
    location = useLocation();
  const [status, setStatus] = useState<DeviceStatus | null>(null),
    [checking, setChecking] = useState(true),
    [loading, setLoading] = useState(false);
  const [verified, setVerified] = useState(false);
  const [recovering, setRecovering] = useState(false), [recovered, setRecovered] = useState(false);
  const [failure, setFailure] = useState<unknown>(null);
  const request = useRef<AbortController | null>(null),
    submitting = useRef(false);
  useEffect(() => {
    let active = true;
    getDeviceStatus()
      .then((value) => {
        if (active) setStatus(value);
      })
      .catch((error) => {
        if (active) setFailure(captureError(error));
      })
      .finally(() => {
        if (active) setChecking(false);
      });
    return () => {
      active = false;
      request.current?.abort();
      if (submitting.current) void logout().catch(() => {});
    };
  }, []);
  const method =
    status?.platform === "windows"
      ? t("device.windows")
      : status?.platform === "macos"
        ? t("device.macos")
        : t("device.method");
  const available = status?.availability === "available";
  async function check() {
    setChecking(true);
    setFailure(null);
    try {
      setStatus(await getDeviceStatus());
    } catch (error) {
      setFailure(captureError(error));
    } finally {
      setChecking(false);
    }
  }
  async function unlock() {
    if (submitting.current || !available) return;
    submitting.current = true;
    setLoading(true);
    setVerified(false);
    setFailure(null);
    const controller = new AbortController();
    request.current = controller;
    try {
      if (
        await unlockDevice(
          locale,
          controller.signal,
          async (verificationSignal) => {
            setVerified(true);
            await waitForUnlock(verificationSignal);
          },
        )
      )
        navigate(safeReturnPath(location.state), { replace: true });
    } catch (error) {
      if (
        !controller.signal.aborted &&
        !(error instanceof DOMException && error.name === "AbortError")
      )
        setFailure(captureError(error));
    } finally {
      submitting.current = false;
      if (!controller.signal.aborted) {
        setLoading(false);
        setVerified(false);
      }
    }
  }
  return (
    <div
      className="unlock-page"
      data-phase={
        verified
          ? "verified"
          : loading
            ? "verifying"
            : failure
              ? "error"
              : "idle"
      }
    >
      <header className="unlock-header">
        <Brand />
        <div className="unlock-controls">
          <button
            className="unlock-language"
            aria-label={t("device.language")}
            onClick={() =>
              setPreference(locale === "zh-CN" ? "en-US" : "zh-CN")
            }
          >
            <Icon name="language" />
            {locale === "zh-CN" ? "EN" : "中文"}
          </button>
          <ThemeControl compact />
        </div>
      </header>
      <main className="unlock-layout">
        <section className="unlock-story" aria-labelledby="unlock-story-title">
          <p className="unlock-eyebrow">
            <span />
            {t("device.eyebrow")}
          </p>
          <h1 id="unlock-story-title">
            {t("device.storyFirst")}
            <br />
            <span>{t("device.storySecond")}</span>
          </h1>
          <p className="unlock-story-copy">{t("device.storyCopy")}</p>
          <div className="vault-illustration" aria-hidden="true">
            <div className="vault-ring one" />
            <div className="vault-ring two" />
            <div className="vault-illustration-card">
              <div className="vault-card-top">
                <span className="vault-card-mark">
                  <Icon name="lock" />
                </span>
                <span className="vault-card-status">
                  <i />
                  {t("device.vaultLocked")}
                </span>
              </div>
              <span className="vault-card-label">{t("device.localVault")}</span>
              <div className="vault-card-lines">
                <i />
                <i />
              </div>
              <div className="vault-card-bottom">
                <Icon name="shield" />
                <span>{t("device.onDevice")}</span>
              </div>
            </div>
            <span className="vault-spark one" />
            <span className="vault-spark two" />
          </div>
          <p className="unlock-privacy">
            <Icon name="shield" />
            {t("device.privacy")}
          </p>
        </section>
        <section className="unlock-card" aria-labelledby="unlock-title">
          <div className="unlock-symbol">
            <Icon name={verified ? "check" : "fingerprint"} />
          </div>
          <p className="unlock-card-eyebrow">{t("device.cardEyebrow")}</p>
          <h2 id="unlock-title">
            {t(verified ? "config.verified" : "device.title")}
          </h2>
          <p className="unlock-description">
            {t(verified ? "config.opening" : "device.description")}
          </p>
          <div className="unlock-method">
            <span className="unlock-method-icon">
              <Icon
                name={status?.platform === "macos" ? "fingerprint" : "monitor"}
              />
            </span>
            <div>
              <strong>{method}</strong>
              <span>
                {checking
                  ? t("device.checking")
                  : available
                    ? t("device.ready")
                    : t("device.needsAttention")}
              </span>
            </div>
            <span
              className={`unlock-ready-dot ${available ? "ready" : ""}`}
              aria-hidden="true"
            />
          </div>
          {!checking && !available && (
            <p className="unlock-availability" role="status">
              {status?.availability === "not_configured"
                ? t("device.notConfigured")
                : status?.availability === "unsupported"
                  ? t("device.desktopOnly")
                  : t("device.unavailable")}
            </p>
          )}
          {failure != null && (
            <p className="unlock-error" role="alert">
              {errorMessage(failure)}
            </p>
          )}
          <button
            className="button primary unlock-primary"
            type="button"
            data-testid="device-unlock"
            onClick={() => void unlock()}
            disabled={checking || loading || recovering || !available}
            aria-busy={loading}
            aria-describedby="unlock-explanation"
          >
            {loading ? (
              <>
                <span className="spinner" />
                {t(verified ? "config.opening" : "device.verifying")}
              </>
            ) : (
              <>
                {t("device.unlock")}
                <Icon name="arrow" />
              </>
            )}
          </button>
          {!available && (
            <button
              className="unlock-recheck"
              type="button"
              disabled={checking}
              onClick={() => void check()}
            >
              <Icon name="refresh" />
              {t("device.checkAgain")}
            </button>
          )}
          <button type="button" className="unlock-recheck" disabled={checking || loading || recovering || !available} onClick={() => { setRecovered(false); setRecovering(true); }}>{t("data.restore")}</button>
          {recovered && <p role="status" className="data-success">{t("data.restored")}</p>}
          <p className="unlock-explanation" id="unlock-explanation">
            <Icon name="lock" />
            {t("device.explanation")}
          </p>
          <div className="unlock-demo">
            <span>{t("device.demoLead")}</span>
            <button
              type="button"
              disabled={loading || recovering}
              onClick={() => {
                startDemo();
                navigate("/home/homepage");
              }}
            >
              {t("device.demo")}
              <Icon name="arrow" />
            </button>
          </div>
        </section>
      </main>
      {recovering && <DataDialog action="restore" onClose={() => setRecovering(false)} onDone={() => { setRecovering(false); setRecovered(true); setFailure(null); }} />}
      <footer className="unlock-footer">
        <span>© {new Date().getFullYear()} LedgerNest</span>
        <span>{t("device.footer")}</span>
      </footer>
    </div>
  );
}
