import { useEffect, useRef, useState } from "react";
import type { FormEvent } from "react";
import { useI18n } from "../../i18n/LanguageContext";
import { backupData, restoreData, exportRecords, captureError, errorMessage } from "../../services/api";
import type { DataResult, ExportFormat } from "../../../../../shared/data-tools";
import Modal from "../ui/Modal";
import Dropdown from "../ui/Dropdown";
export type DataAction = "backup" | "restore" | "export";
export default function DataDialog({ action, onClose, onDone }: {
  action: DataAction; onClose: () => void; onDone: (result: DataResult) => void;
}) {
  const { t, locale } = useI18n();
  const [busy, setBusy] = useState(false), [failure, setFailure] = useState<unknown>(null);
  const [format, setFormat] = useState<ExportFormat>("csv"), [confirmed, setConfirmed] = useState(false);
  const passphrase = useRef<HTMLInputElement>(null), repeat = useRef<HTMLInputElement>(null);
  const alive = useRef(true), submitting = useRef(false);
  useEffect(() => {
    alive.current = true;
    const inputs = [passphrase.current, repeat.current];
    return () => { alive.current = false; for (const input of inputs) if (input) input.value = ""; };
  }, []);
  function clear() { for (const ref of [passphrase, repeat]) if (ref.current) ref.current.value = ""; }
  async function submit(event: FormEvent) {
    event.preventDefault(); if (submitting.current) return;
    submitting.current = true; setBusy(true); setFailure(null);
    try {
      const request = action === "export" ? exportRecords(format, locale)
        : action === "backup" ? backupData(passphrase.current?.value || "", repeat.current?.value || "")
        : restoreData(passphrase.current?.value || "", locale);
      clear();
      const result = await request;
      if (alive.current) { if (result) onDone(result); else onClose(); }
    } catch (error) { if (alive.current) setFailure(captureError(error)); }
    finally { clear(); submitting.current = false; if (alive.current) setBusy(false); }
  }
  return <Modal title={t(`data.${action}`)} onClose={() => { clear(); onClose(); }} preventClose={busy}>
    <form className="configuration-form" autoComplete="off" onSubmit={event => void submit(event)}>
      <p className="config-form-note">{t(`data.${action}Note`)}</p>
      {action === "export" ? <>
        <label className="config-field"><span>{t("data.format")}</span>
          <Dropdown label={t("data.format")} value={format} onChange={setFormat} disabled={busy} options={[{ value: "csv", label: "CSV" }, { value: "json", label: "JSON" }]} />
        </label>
        <p className="config-form-note">{t(format === "csv" ? "data.csvNote" : "data.jsonNote")}</p>
        <label className="data-confirm"><input type="checkbox" required checked={confirmed} disabled={busy} onChange={event => setConfirmed(event.target.checked)} />{t("data.plaintextConfirm")}</label>
      </> : <>
        <label className="config-field"><span>{t("data.passphrase")}</span><input ref={passphrase} name="backup-passphrase" type="password" minLength={12} maxLength={256} required disabled={busy} autoComplete="off" spellCheck={false} /></label>
        {action === "backup" && <label className="config-field"><span>{t("data.repeat")}</span><input ref={repeat} name="backup-repeat" type="password" minLength={12} maxLength={256} required disabled={busy} autoComplete="off" spellCheck={false} /></label>}
        <p className="config-form-note">{t("data.passwordNote")}</p>
      </>}
      {failure != null && <p className="form-error" role="alert">{errorMessage(failure)}</p>}
      <div className="config-dialog-actions">
        <button type="button" className="button secondary" disabled={busy} onClick={() => { clear(); onClose(); }}>{t("config.cancel")}</button>
        <button type="submit" className="button primary" disabled={busy || (action === "export" && !confirmed)} aria-busy={busy}>{busy ? t("data.working") : t("data.continue")}</button>
      </div>
    </form>
  </Modal>;
}
