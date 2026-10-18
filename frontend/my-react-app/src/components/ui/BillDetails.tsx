import { useI18n } from "../../i18n/LanguageContext";
import type { Bill } from "../../types/billing";
import { cents, fullDateLabel, money } from "../../lib/billing";
import Modal from "./Modal";
import BillStatus from "./BillStatus";
export default function BillDetails({
  bill,
  onClose,
}: {
  bill: Bill;
  onClose: () => void;
}) {
  const { t } = useI18n();
  const status = bill.settlementStatus;
  return (
    <Modal title={t("details.title")} onClose={onClose}>
      <div className="detail-hero">
        <div className="vendor-icon large">{bill.vendorName.slice(0, 1)}</div>
        <h3>{bill.vendorName}</h3>
        <strong>{money(cents(bill.amount))}</strong>
        <BillStatus bill={bill} />
      </div>
      <dl className="detail-list">
        <div>
          <dt>{t("details.confirmed")}</dt>
          <dd>{money(cents(bill.confirmedAmount))}</dd>
        </div>
        <div>
          <dt>{t("details.processing")}</dt>
          <dd>{money(cents(bill.processingAmount))}</dd>
        </div>
        <div>
          <dt>{t("details.remaining")}</dt>
          <dd>{money(cents(bill.remainingAmount))}</dd>
        </div>
        {cents(bill.overpaidAmount) > 0 && (
          <div>
            <dt>{t("details.overpaid")}</dt>
            <dd>{money(cents(bill.overpaidAmount))}</dd>
          </div>
        )}
        <div>
          <dt>{t("details.id")}</dt>
          <dd>#{bill.id}</dd>
        </div>
        <div>
          <dt>{t("field.createdDate")}</dt>
          <dd>{fullDateLabel(bill.createdAt)}</dd>
        </div>
        <div>
          <dt>{t("field.dueDate")}</dt>
          <dd>{fullDateLabel(bill.dueAt)}</dd>
        </div>
        <div className="detail-note">
          <dt>{t("field.comment")}</dt>
          <dd>{bill.comment || t("common.notProvided")}</dd>
        </div>
      </dl>
      <div className="modal-actions">
        {status !== "voided" && cents(bill.remainingAmount) > 0 && (
          <button className="button primary" disabled>
            {t("details.pay")}
          </button>
        )}
      </div>
    </Modal>
  );
}
