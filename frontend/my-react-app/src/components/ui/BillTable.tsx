import { useI18n } from "../../i18n/LanguageContext";
import { useState } from "react";
import type { Bill } from "../../types/billing";
import { cents, dateLabel, money } from "../../lib/billing";
import BillDetails from "./BillDetails";
import Icon from "./Icon";
import BillStatus from "./BillStatus";
import { IconButton } from "./IconAction";

/** 列表与首页共用，详情作为弹窗打开，不占用额外路由。 */
export default function BillTable({ bills }: { bills: Bill[] }) {
  const { t } = useI18n();
  const [selected, setSelected] = useState<Bill | null>(null);
  return (
    <>
      <div className="table-scroll">
        <table className="bill-table">
          <thead>
            <tr>
              <th scope="col">{t("table.bill")}</th>
              <th scope="col">{t("field.dueDate")}</th>
              <th scope="col">{t("table.status")}</th>
              <th scope="col" className="numeric">
                {t("field.amount")}
              </th>
              <th scope="col">
                <span className="sr-only">{t("table.action")}</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {bills.map((bill) => {
              return (
                <tr
                  key={bill.id}
                  onClick={(event) => {
                    // 整行可用鼠标打开；键盘使用行内原生按钮，保留表格语义。
                    if (!(event.target as Element).closest("button, a")) {
                      event.currentTarget
                        .querySelector<HTMLButtonElement>(".vendor-button")
                        ?.focus();
                      setSelected(bill);
                    }
                  }}
                >
                  <td>
                    <button
                      className="vendor-button"
                      onClick={() => setSelected(bill)}
                    >
                      <span className="vendor-icon">
                        {bill.vendorName.slice(0, 1)}
                      </span>
                      <span>
                        <strong>{bill.vendorName}</strong>
                      </span>
                    </button>
                  </td>
                  <td className="muted">{dateLabel(bill.dueAt)}</td>
                  <td>
                    <BillStatus bill={bill} />
                  </td>
                  <td className="numeric amount">
                    {money(cents(bill.amount))}
                  </td>
                  <td>
                    <IconButton
                      icon="chevron"
                      side="top"
                      label={t("table.detailsAria", { name: bill.vendorName })}
                      onClick={() => setSelected(bill)}
                    />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {!bills.length && (
        <div className="empty-state">
          <Icon name="bills" />
          <h3>{t("bills.empty")}</h3>
        </div>
      )}
      {selected && (
        <BillDetails bill={selected} onClose={() => setSelected(null)} />
      )}
    </>
  );
}
