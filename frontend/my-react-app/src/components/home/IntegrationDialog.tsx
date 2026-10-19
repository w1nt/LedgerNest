import { useEffect, useRef, useState } from "react";
import type { FormEvent } from "react";
import Modal from "../ui/Modal";
import Dropdown from "../ui/Dropdown";
import Icon from "../ui/Icon";
import { useI18n } from "../../i18n/LanguageContext";
import {
  saveIntegration,
  captureError,
  errorMessage,
} from "../../services/api";
import { aiProviders } from "../../../../../shared/settings";
import type {
  AIProvider,
  IntegrationKind,
  SettingsSnapshot,
} from "../../../../../shared/settings";
export default function IntegrationDialog({
  kind,
  settings,
  onClose,
  onSaved,
}: {
  kind: IntegrationKind;
  settings: SettingsSnapshot;
  onClose: () => void;
  onSaved: (value: SettingsSnapshot) => void;
}) {
  const { t } = useI18n();
  const [env, setEnv] = useState(settings.plaid.environment),
    [provider, setProvider] = useState<AIProvider>(settings.ai.provider),
    [baseUrl, setBaseUrl] = useState(settings.ai.baseUrl),
    [model, setModel] = useState(settings.ai.model);
  const [busy, setBusy] = useState(false),
    [failure, setFailure] = useState<unknown>(null);
  // Credentials are deliberately uncontrolled and are never prefilled or stored in React state.
  const clientId = useRef<HTMLInputElement>(null),
    secret = useRef<HTMLInputElement>(null),
    apiKey = useRef<HTMLInputElement>(null);
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      for (const ref of [clientId, secret, apiKey])
        if (ref.current) ref.current.value = "";
    };
  }, []);
  function clear() {
    for (const ref of [clientId, secret, apiKey])
      if (ref.current) ref.current.value = "";
  }
  function close() {
    alive.current = false;
    clear();
    onClose();
  }
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setFailure(null);
    try {
      const input =
        kind === "plaid"
          ? {
              kind: "plaid" as const,
              environment: env,
              clientId: clientId.current?.value || "",
              secret: secret.current?.value || "",
            }
          : {
              kind: "ai" as const,
              provider,
              baseUrl,
              model,
              apiKey: apiKey.current?.value || "",
            };
      const next = await saveIntegration(input);
      clear();
      if (alive.current) {
        onSaved(next);
        close();
      }
    } catch (error) {
      clear();
      if (alive.current) setFailure(captureError(error));
    } finally {
      if (alive.current) setBusy(false);
    }
  }
  const configured =
    kind === "plaid" ? settings.plaid.configured : settings.ai.configured;
  const blockCopy = {
    onCopy: (event: React.ClipboardEvent<HTMLInputElement>) =>
      event.preventDefault(),
    onCut: (event: React.ClipboardEvent<HTMLInputElement>) =>
      event.preventDefault(),
    onContextMenu: (event: React.MouseEvent<HTMLInputElement>) =>
      event.preventDefault(),
    onDragStart: (event: React.DragEvent<HTMLInputElement>) =>
      event.preventDefault(),
  };
  return (
    <Modal
      title={t(kind === "plaid" ? "config.editPlaid" : "config.editAI")}
      onClose={close}
      preventClose={busy}
    >
      <form
        className="configuration-form"
        onSubmit={(event) => void submit(event)}
        autoComplete="off"
      >
        <p className="config-form-note">
          {t(configured ? "config.keepExisting" : "config.enterCredentials")}
        </p>
        {kind === "plaid" ? (
          <>
            <label className="config-field">
              <span>{t("config.environment")}</span>
              <Dropdown
                label={t("config.environment")}
                value={env}
                onChange={setEnv}
                disabled={busy}
                options={[
                  { value: "sandbox", label: "Sandbox" },
                  { value: "production", label: "Trial / Production" },
                ]}
              />
            </label>
            <label className="config-field">
              <span>Client ID</span>
              <input
                ref={clientId}
                name="plaid-client-id"
                type="password"
                autoComplete="new-password"
                spellCheck={false}
                maxLength={1024}
                minLength={12}
                required={!configured}
                disabled={busy}
                placeholder={t(
                  configured
                    ? "config.keepPlaceholder"
                    : "config.pasteCredential",
                )}
                {...blockCopy}
              />
            </label>
            <label className="config-field">
              <span>Secret</span>
              <input
                ref={secret}
                name="plaid-secret"
                type="password"
                autoComplete="new-password"
                spellCheck={false}
                maxLength={1024}
                minLength={12}
                required={!configured || env !== settings.plaid.environment}
                disabled={busy}
                placeholder={t(
                  configured
                    ? "config.keepPlaceholder"
                    : "config.pasteCredential",
                )}
                {...blockCopy}
              />
            </label>
            <p className="config-form-note">{t("config.plaidScope")}</p>
          </>
        ) : (
          <>
            <label className="config-field">
              <span>{t("config.provider")}</span>
              <Dropdown
                label={t("config.provider")}
                value={provider}
                onChange={(value) => {
                  setProvider(value);
                  setBaseUrl(aiProviders[value].baseUrl);
                  setModel("");
                  clear();
                }}
                disabled={busy}
                options={Object.entries(aiProviders).map(([value, entry]) => ({
                  value: value as AIProvider,
                  label:
                    value === "custom"
                      ? t("config.customProvider")
                      : entry.name,
                }))}
              />
            </label>
            <label className="config-field">
              <span>API Base URL</span>
              <input
                name="base-url"
                type="url"
                value={baseUrl}
                onChange={(event) => setBaseUrl(event.target.value)}
                maxLength={300}
                required
                disabled={busy || provider !== "custom"}
                placeholder="https://api.example.com/v1"
                spellCheck={false}
              />
            </label>
            <label className="config-field">
              <span>{t("config.model")}</span>
              <input
                name="model"
                value={model}
                onChange={(event) => setModel(event.target.value)}
                maxLength={100}
                required
                disabled={busy}
                placeholder={t("config.modelPlaceholder")}
                spellCheck={false}
              />
            </label>
            <label className="config-field">
              <span>API Key</span>
              <input
                ref={apiKey}
                name="ai-api-key"
                type="password"
                autoComplete="new-password"
                spellCheck={false}
                minLength={12}
                maxLength={1024}
                required={
                  !configured ||
                  provider !== settings.ai.provider ||
                  baseUrl !== settings.ai.baseUrl
                }
                disabled={busy}
                placeholder={t(
                  configured
                    ? "config.keepPlaceholder"
                    : "config.pasteCredential",
                )}
                {...blockCopy}
              />
            </label>
            <p className="config-form-note">{t("config.aiPrivacy")}</p>
          </>
        )}
        <p className="config-secret-note">
          <Icon name="shield" />
          {t("config.secretPolicy")}
        </p>
        {failure != null && (
          <p className="form-error" role="alert">
            {errorMessage(failure)}
          </p>
        )}
        <div className="config-dialog-actions">
          <button
            type="button"
            className="button secondary"
            disabled={busy}
            onClick={close}
          >
            {t("config.cancel")}
          </button>
          <button
            type="submit"
            className="button primary"
            disabled={busy}
            aria-busy={busy}
          >
            {busy ? (
              <>
                <span className="spinner" />
                {t("config.saving")}
              </>
            ) : (
              t("config.save")
            )}
          </button>
        </div>
      </form>
    </Modal>
  );
}
