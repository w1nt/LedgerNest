import { useEffect, useState } from "react";
import { useI18n } from "../../i18n/LanguageContext";
import { getBackupLocation, chooseBackupDirectory, captureError, errorMessage } from "../../services/api";
import type { BackupLocation, DataResult } from "../../../../../shared/data-tools";
import CloudPanel from "./CloudPanel";
import Panel from "../ui/Panel";
import Icon from "../ui/Icon";
import DataDialog from "./DataDialog";
import type { DataAction } from "./DataDialog";
export default function DataPanel({ isDemo }: { isDemo: boolean }) {
  const { t } = useI18n();
  const [location, setLocation] = useState<BackupLocation | null>(null), [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<unknown>(null), [result, setResult] = useState<DataResult | null>(null);
  const [action, setAction] = useState<DataAction | null>(null), [revision, setRevision] = useState(0);
  useEffect(() => {
    let alive = true;
    if (!isDemo) getBackupLocation().then(value => { if (alive) { setLocation(value); setFailure(null); } }).catch(error => { if (alive) setFailure(captureError(error)); });
    return () => { alive = false; };
  }, [isDemo, revision]);
  async function directory() {
    if (busy) return; setBusy(true); setFailure(null); setResult(null);
    try { const value = await chooseBackupDirectory(); if (value) setLocation(value); }
    catch (error) { setFailure(captureError(error)); }
    finally { setBusy(false); }
  }
  function open(next: DataAction) { setFailure(null); setResult(null); setAction(next); }
  return <>
    <Panel title={t("data.backupsTitle")} icon="shield" className="settings-panel">
      <p className="integration-description">{t("data.directoryNote")}</p>
      <div className="data-directory"><span>{t("data.directory")}</span><code>{location?.directory || t("data.noDirectory")}</code></div>
      <div className="data-actions">
        <button className="button secondary" type="button" disabled={isDemo || busy} onClick={() => void directory()}>{t("data.chooseDirectory")}</button>
        <button className="button primary" type="button" disabled={isDemo || busy || !location} onClick={() => open("backup")}><Icon name="download" />{t("data.backup")}</button>
        <button className="button secondary" type="button" disabled={isDemo || busy} onClick={() => open("restore")}><Icon name="refresh" />{t("data.restore")}</button>
      </div>
      <p className="settings-section-note">{t("data.backupScope")}</p>
      <p className="settings-section-note">{t("data.cloudNote")}</p>
    </Panel>
    <CloudPanel isDemo={isDemo} />
    <Panel title={t("data.exportTitle")} icon="download" className="settings-panel">
      <p className="integration-description">{t("data.exportNote")}</p>
      <button className="button secondary" type="button" disabled={isDemo || busy} onClick={() => open("export")}>{t("data.export")}</button>
    </Panel>
    {isDemo && <p className="settings-section-note">{t("data.demo")}</p>}
    {failure != null && <div className="settings-feedback"><p className="form-error" role="alert">{errorMessage(failure)}</p><button className="button secondary" onClick={() => setRevision(v => v + 1)}>{t("device.checkAgain")}</button></div>}
    {result && <p className="data-success" role="status"><Icon name="check" />{t("data.saved", { file: result.fileName, count: result.records })}</p>}
    {action && <DataDialog action={action} onClose={() => setAction(null)} onDone={value => { setResult(value); setAction(null); }} />}
  </>;
}
