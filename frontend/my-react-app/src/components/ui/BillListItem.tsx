import type { Bill } from "../../types/billing";
import { cents, dateLabel, isOverdue, money } from "../../lib/billing";
import { useI18n } from "../../i18n/LanguageContext";
import Icon from "./Icon";

/** 到期列表与提醒共用；备注只在 BillDetails 中显示。日期是处理账单所需信息。 */
export default function BillListItem({
  bill,
  onSelect,
}: {
  bill: Bill;
  onSelect: (bill: Bill) => void;
}) {
  const { t } = useI18n();
  return (
    <button
      type="button"
      className="bill-list-item"
      onClick={() => onSelect(bill)}
      aria-label={t("table.detailsAria", { name: bill.vendorName })}
    >
      <span className="vendor-icon">{bill.vendorName.slice(0, 1)}</span>
      <span className="bill-list-name">
        <strong>{bill.vendorName}</strong>
        <time
          dateTime={bill.dueAt}
          className={isOverdue(bill) ? "overdue-text" : "muted"}
        >
          {dateLabel(bill.dueAt)}
        </time>
      </span>
      <strong>{money(cents(bill.remainingAmount))}</strong>
      <Icon name="chevron" className="row-chevron" />
    </button>
  );
}
