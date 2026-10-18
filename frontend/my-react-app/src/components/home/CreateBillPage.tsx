import { useI18n } from "../../i18n/LanguageContext";
import { useRef, useState } from "react";
import type { FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { useBills } from "../../context/BillsContext";
import { useSession } from "../../context/SessionContext";
import { captureError, errorMessage } from "../../services/api";
import { cents, money, fullDateLabel } from "../../lib/billing";
import Icon from "../ui/Icon";
import { billRequest, localDueDate } from "../../security/validation";
import PageHeader from "../ui/PageHeader";
import Panel from "../ui/Panel";
import InfoDialog from "../ui/InfoDialog";
import { IconButton, IconLink } from "../ui/IconAction";

export default function CreateBillPage() {
  const { t } = useI18n();
  const { addBill } = useBills();
  const { isDemo } = useSession();
  const navigate = useNavigate();
  const [vendorName, setVendorName] = useState("");
  const [amount, setAmount] = useState("");
  const [dueAt, setDueAt] = useState("");
  const [comment, setComment] = useState("");
  const [saving, setSaving] = useState(false);
  const [failure, setError] = useState<unknown>(null);
  const error = failure ? errorMessage(failure) : "";
  const submitting = useRef(false);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting.current) return;
    setError("");
    try {
      const payload = billRequest({
        amount,
        vendorName,
        comment,
        dueAt: localDueDate(dueAt),
      });
      submitting.current = true;
      setSaving(true);
      // 所属账号由后端会话确定，请求不携带用户编号。
      await addBill(payload);
      navigate("/home/bills", { state: { created: true } });
    } catch (error) {
      setError(captureError(error));
    } finally {
      submitting.current = false;
      setSaving(false);
    }
  }
  return (
    <>
      <PageHeader
        title={t("nav.create")}
        actions={
          <>
            <IconLink
              to="/home/bills"
              icon="arrow"
              className="previous"
              label={t("bills.back")}
            />
            <InfoDialog title={t("create.information")}>
              <p>{t("create.statusNote")}</p>
              <p>{isDemo ? t("demo.recordsNote") : t("create.saveNote")}</p>
            </InfoDialog>
          </>
        }
      />
      <div className="create-layout">
        <Panel title={t("create.information")} className="form-panel">
          <form className="bill-form" onSubmit={submit}>
            <label>
              {t("field.billName")} <span className="required">*</span>
              <input
                autoFocus
                required
                maxLength={100}
                value={vendorName}
                onChange={(event) => setVendorName(event.target.value)}
                placeholder={t("create.namePlaceholder")}
              />
            </label>
            <div className="form-row">
              <label>
                {t("field.amount")} <span className="required">*</span>
                <div className="amount-input">
                  <span>$</span>
                  <input
                    type="number"
                    step="0.01"
                    min="0.01"
                    max="999999999.99"
                    required
                    value={amount}
                    onChange={(event) => setAmount(event.target.value)}
                    placeholder="0.00"
                  />
                  <span>USD</span>
                </div>
              </label>
              <label>
                {t("field.dueDate")} <span className="required">*</span>
                <input
                  type="date"
                  min="1000-01-01"
                  max="9998-12-31"
                  required
                  value={dueAt}
                  onChange={(event) => setDueAt(event.target.value)}
                />
              </label>
            </div>
            <label>
              {t("field.comment")}{" "}
              <span className="optional">{t("common.optional")}</span>
              <textarea
                maxLength={500}
                rows={4}
                value={comment}
                onChange={(event) => setComment(event.target.value)}
                placeholder={t("create.notesPlaceholder")}
              />
              <small className="field-counter">{comment.length} / 500</small>
            </label>
            {error && (
              <p className="form-error" role="alert">
                {error}
              </p>
            )}
            <div className="form-actions">
              <IconLink
                to="/home/bills"
                icon="close"
                label={t("common.cancel")}
              />
              <IconButton
                type="submit"
                className="primary-action"
                disabled={saving}
                aria-busy={saving}
                icon={saving ? "refresh" : "check"}
                label={saving ? t("create.saving") : t("create.save")}
              />
            </div>
          </form>
        </Panel>
        <aside>
          <div className="bill-preview panel" aria-label={t("create.preview")}>
            <div className="vendor-icon large">
              {vendorName.slice(0, 1) || "B"}
            </div>
            <h2>{vendorName.trim() || t("create.newBill")}</h2>
            <strong className="preview-amount">
              {amount && /^\d+(\.\d{1,2})?$/.test(amount)
                ? money(cents(amount))
                : money(0)}
            </strong>
            <span className="status unpaid">
              <span />
              {t("status.unpaid")}
            </span>
            <div className="preview-date">
              <Icon name="clock" />
              {dueAt
                ? t("bills.due", { date: fullDateLabel(dueAt) })
                : t("create.chooseDate")}
            </div>
          </div>
        </aside>
      </div>
    </>
  );
}
