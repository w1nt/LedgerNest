import type { Bill } from "../../types/billing";
import { isOverdue, statusLabels } from "../../lib/billing";
import { useI18n } from "../../i18n/LanguageContext";

/** 主结算阶段与逾期保持独立；列表、卡片、详情均使用同一个展示规则。 */
export default function BillStatus({ bill }: { bill: Bill }) {
  const { t } = useI18n();
  return (
    <span className="bill-status-group">
      <span className={`status ${bill.settlementStatus}`}>
        <span />
        {statusLabels[bill.settlementStatus]}
      </span>
      {isOverdue(bill) && (
        <span className="status overdue">{t("status.overdue")}</span>
      )}
    </span>
  );
}
