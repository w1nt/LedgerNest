import { useEffect, useRef, useState } from "react";
import type { FormEvent } from "react";
import type { CloudState, CloudFile } from "../../../../../shared/cloud";
import { getCloudState, importCloudClient, connectCloud, saveCloud, syncCloud, disconnectCloud, listCloudBackups, downloadCloudBackup, cancelCloud, captureError, errorMessage } from "../../services/api";
import { useI18n } from "../../i18n/LanguageContext";
import Panel from "../ui/Panel";
import Modal from "../ui/Modal";
import SecretValue from "../ui/SecretValue";
import Icon from "../ui/Icon";
function CloudForm({ value, onClose, onSaved }: { value: CloudState; onClose: () => void; onSaved: (value: CloudState) => void }) {
  const { t } = useI18n();
  const [enabled, setEnabled] = useState(value.enabled), [automatic, setAutomatic] = useState(value.automatic);
  const [hours, setHours] = useState(String(value.intervalHours)), [folderName, setFolderName] = useState(value.folderName), [prefix, setPrefix] = useState(value.filePrefix);
  const [remember, setRemember] = useState(false), [passwordEntered, setPasswordEntered] = useState(false), [busy, setBusy] = useState(false), [failure, setFailure] = useState<unknown>(null);
  const password = useRef<HTMLInputElement>(null), confirmation = useRef<HTMLInputElement>(null), alive = useRef(true), submitting = useRef(false);
  useEffect(() => { alive.current = true; const inputs = [password.current, confirmation.current]; return () => { alive.current = false; for (const input of inputs) if (input) input.value = ""; }; }, []);
  function clear() { if (password.current) password.current.value = ""; if (confirmation.current) confirmation.current.value = ""; setPasswordEntered(false); }
  async function submit(event: FormEvent) {
    event.preventDefault(); if (submitting.current) return; submitting.current = true; setBusy(true); setFailure(null);
    try {
      const request = saveCloud({ enabled, automatic, intervalHours: Number(hours), folderName, filePrefix: prefix, password: password.current?.value || "", confirmation: confirmation.current?.value || "", rememberConfirmed: remember });
      clear(); const next = await request; if (alive.current) { onSaved(next); onClose(); }
    } catch (error) { if (alive.current) setFailure(captureError(error)); }
    finally { clear(); submitting.current = false; if (alive.current) setBusy(false); }
  }
  return <Modal title={t("cloud.configure")} onClose={onClose} preventClose={busy}>
    <form className="configuration-form" autoComplete="off" onSubmit={event => void submit(event)}>
      <p className="config-form-note">{t("cloud.formNote")}</p>
      <label className="data-confirm"><input type="checkbox" checked={enabled} disabled={busy || !value.connected} onChange={e => { setEnabled(e.target.checked); if (!e.target.checked) setAutomatic(false); }} />{t("cloud.enable")}</label>
      {!value.connected && <p className="config-form-note">{t("cloud.connectFirst")}</p>}
      <label className="data-confirm"><input type="checkbox" checked={automatic} disabled={busy || !enabled} onChange={e => setAutomatic(e.target.checked)} />{t("cloud.automatic")}</label>
      <label className="config-field"><span>{t("cloud.interval")}</span><input type="number" min={1} max={720} step={1} required value={hours} disabled={busy} onChange={e => setHours(e.target.value)} /></label>
      <label className="config-field"><span>{t("cloud.folder")}</span><input maxLength={80} required={enabled} value={folderName} disabled={busy} onChange={e => setFolderName(e.target.value)} /></label>
      <label className="config-field"><span>{t("cloud.prefix")}</span><input maxLength={80} required={enabled} value={prefix} disabled={busy} onChange={e => setPrefix(e.target.value)} /></label>
      <p className="config-form-note">{t("cloud.namingNote")}</p>
      <label className="config-field"><span>{t(value.passwordSet ? "cloud.replacePassword" : "data.passphrase")}</span><input ref={password} type="password" minLength={12} maxLength={256} autoComplete="off" required={enabled && !value.passwordSet} disabled={busy} onChange={e => setPasswordEntered(!!e.target.value)} /></label>
      <label className="config-field"><span>{t("data.repeat")}</span><input ref={confirmation} type="password" minLength={12} maxLength={256} autoComplete="off" required={passwordEntered} disabled={busy} /></label>
      <p className="config-form-note">{t("cloud.passwordNote")}</p>
      <label className="data-confirm"><input type="checkbox" checked={remember} required={passwordEntered} disabled={busy} onChange={e => setRemember(e.target.checked)} />{t("cloud.remember")}</label>
      {failure != null && <p className="form-error" role="alert">{errorMessage(failure)}</p>}
      <div className="config-dialog-actions"><button type="button" className="button secondary" disabled={busy} onClick={onClose}>{t("config.cancel")}</button><button type="submit" className="button primary" disabled={busy}>{t(busy ? "config.saving" : "cloud.save")}</button></div>
    </form>
  </Modal>;
}
export default function CloudPanel({ isDemo }: { isDemo: boolean }) {
  const { t, locale } = useI18n();
  const [value, setValue] = useState<CloudState | null>(null), [failure, setFailure] = useState<unknown>(null), [busy, setBusy] = useState(false), [editing, setEditing] = useState(false), [removing, setRemoving] = useState(false);
  const [files, setFiles] = useState<CloudFile[] | null>(null), [notice, setNotice] = useState<"uploaded" | "downloaded" | "saved" | null>(null);
  const alive = useRef(true), running = useRef(false);
  useEffect(() => {
    alive.current = true; let fetching = false;
    async function load() {
      if (isDemo || fetching) return; fetching = true;
      try { const next = await getCloudState(); if (alive.current) setValue(next); }
      catch (error) { if (alive.current) setFailure(captureError(error)); }
      finally { fetching = false; }
    }
    void load(); const timer = window.setInterval(() => void load(), 5000);
    return () => { alive.current = false; window.clearInterval(timer); };
  }, [isDemo]);
  async function perform(action: () => Promise<void>) {
    if (running.current) return; running.current = true; setBusy(true); setFailure(null); setNotice(null);
    try { await action(); } catch (error) { if (alive.current) setFailure(captureError(error)); }
    finally { running.current = false; if (alive.current) setBusy(false); }
  }
  function date(value: string | null) { return value ? new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short" }).format(new Date(value)) : t("cloud.never"); }
  const working = busy || (!!value && value.phase !== "idle"), disabled = isDemo || working || !value;
  return <Panel title={t("cloud.title")} icon="link" className="settings-panel">
    <p className="integration-description">{t("cloud.intro")}</p>
    <p className="settings-section-note">{t("cloud.setupNote")}</p>
    <dl className="integration-details"><div><dt>{t("cloud.client")}</dt><dd><SecretValue value={value?.clientId || null} /></dd></div><div><dt>Client Secret</dt><dd><SecretValue value={value?.clientSecret || null} /></dd></div><div><dt>{t("cloud.connection")}</dt><dd>{t(value?.connected ? "cloud.connected" : "cloud.disconnected")}</dd></div></dl>
    <div className="data-actions">
      <button type="button" className="button secondary" disabled={disabled} onClick={() => void perform(async () => { const next = await importCloudClient(); if (next && alive.current) { setValue(next); setFiles(null); } })}>{t("cloud.import")}</button>
      <button type="button" className="button secondary" disabled={disabled || !value?.configured} onClick={() => void perform(async () => { const next = await connectCloud(); if (alive.current) { setValue(next); setFiles(null); } })}>{t(value?.connected ? "cloud.reconnect" : "cloud.connect")}</button>
      <button type="button" className="button secondary" disabled={disabled} onClick={() => setEditing(true)}>{t("cloud.configure")}</button>
      {value?.connected && <button type="button" className="button danger subtle" disabled={disabled} onClick={() => setRemoving(true)}>{t("cloud.disconnect")}</button>}
    </div>
    {value && <dl className="cloud-status"><div><dt>{t("cloud.mode")}</dt><dd>{t(!value.enabled ? "cloud.off" : value.automatic ? "cloud.autoMode" : "cloud.manualMode")}{value.enabled && value.automatic ? t("cloud.everyHours", { hours: value.intervalHours }) : ""}</dd></div><div><dt>{t("cloud.lastSuccess")}</dt><dd>{date(value.lastSuccessAt)}</dd></div>{value.enabled && value.automatic && <div><dt>{t("cloud.nextSync")}</dt><dd>{date(value.nextSyncAt)}</dd></div>}</dl>}
    {value && value.phase !== "idle" && <p className="data-success" role="status"><span className="spinner" />{t(`cloud.phase.${value.phase}`)}{value.phase === "uploading" ? ` ${value.progress}%` : ""}</p>}
    {value?.lastError && <p className="form-error" role="status">{t(`cloud.error.${value.lastError}`)}</p>}
    <div className="data-actions"><button type="button" className="button primary" disabled={disabled || !value?.enabled} onClick={() => void perform(async () => { const next = await syncCloud(); if (alive.current) { setValue(next); setNotice("uploaded"); } })}><Icon name="refresh" />{t("cloud.syncNow")}</button><button type="button" className="button secondary" disabled={disabled || !value?.connected || !value?.folderName} onClick={() => void perform(async () => { const next = await listCloudBackups(); if (alive.current) setFiles(next); })}>{t("cloud.history")}</button>{value?.phase !== "idle" && value && <button type="button" className="button secondary" disabled={isDemo} onClick={() => void cancelCloud().catch(error => setFailure(captureError(error)))}>{t("config.cancel")}</button>}</div>
    {files && <div className="cloud-files"><p className="settings-section-note">{t("cloud.historyNote")}</p>{!files.length && <p>{t("cloud.empty")}</p>}{files.map(file => <div className="cloud-file" key={file.id}><div><strong>{file.name}</strong><span>{date(file.createdTime)} · {(file.size / 1024).toFixed(1)} KiB</span></div><button type="button" className="button secondary" disabled={disabled} onClick={() => void perform(async () => { const result = await downloadCloudBackup(file.id); if (result && alive.current) setNotice("downloaded"); })}>{t("cloud.download")}</button></div>)}</div>}
    {notice && <p className="data-success" role="status"><Icon name="check" />{t(`cloud.notice.${notice}`)}</p>}
    {failure != null && <div><p className="form-error" role="alert">{errorMessage(failure)}</p><button className="button secondary" type="button" disabled={isDemo || working} onClick={() => void perform(async () => { const next = await getCloudState(); if (alive.current) setValue(next); })}>{t("device.checkAgain")}</button></div>}
    <p className="settings-section-note">{t("cloud.scheduleNote")}</p>
    <p className="settings-section-note">{t("cloud.versionsNote")}</p>
    {editing && value && <CloudForm value={value} onClose={() => setEditing(false)} onSaved={next => { setValue(next); setFiles(null); setNotice("saved"); setFailure(null); }} />}
    {removing && <Modal title={t("cloud.disconnect")} onClose={() => setRemoving(false)} preventClose={busy}><p className="config-form-note">{t("cloud.disconnectNote")}</p><div className="config-dialog-actions"><button type="button" className="button secondary" disabled={busy} onClick={() => setRemoving(false)}>{t("config.cancel")}</button><button type="button" className="button danger" disabled={busy} onClick={() => void perform(async () => { const next = await disconnectCloud(); if (alive.current) { setValue(next); setFiles(null); setRemoving(false); } })}>{t("cloud.disconnect")}</button></div></Modal>}
  </Panel>;
}
