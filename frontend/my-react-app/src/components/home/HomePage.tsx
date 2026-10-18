import { useState } from "react";
import { useI18n } from "../../i18n/LanguageContext";
import { useBills } from "../../context/BillsContext";
import {
  cents,
  isOverdue,
  money,
  monthKey,
  sumBills,
  sumPaid,
  sumRemaining,
} from "../../lib/billing";
import type { Bill } from "../../types/billing";
import BillTable from "../ui/BillTable";
import BillingChart from "../ui/BillingChart";
import BillDetails from "../ui/BillDetails";
import BillListItem from "../ui/BillListItem";
import DataState from "../ui/DataState";
import Icon from "../ui/Icon";
import { IconLink } from "../ui/IconAction";
import PageHeader from "../ui/PageHeader";
import Panel from "../ui/Panel";
import MetricCard from "../ui/MetricCard";

export default function HomePage() {
  const { t } = useI18n();
  const { bills, loading, error } = useBills();
  const [month, setMonth] = useState(() => monthKey(new Date()));
  const [selected, setSelected] = useState<Bill | null>(null);
  // 视觉调整不改变结算口径：作废排除，已付使用确认净额，待付使用剩余金额。
  const period = bills.filter(
    (bill) =>
      bill.settlementStatus !== "voided" && monthKey(bill.dueAt) === month,
  );
  const paid = period.filter((bill) => bill.settlementStatus === "completed");
  const pending = period.filter((bill) => cents(bill.remainingAmount) > 0);
  const overdue = pending.filter(isOverdue);
  const upcoming = bills
    .filter(
      (bill) =>
        bill.settlementStatus !== "voided" && cents(bill.remainingAmount) > 0,
    )
    .sort((a, b) => Date.parse(a.dueAt) - Date.parse(b.dueAt));
  const recent = [...period]
    .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))
    .slice(0, 5);
  const available = !loading && !error;
  return (
    <>
      <PageHeader
        title={t("nav.overview")}
        actions={
          <>
            <label className="month-picker">
              <Icon name="clock" />
              <span className="sr-only">{t("overview.month")}</span>
              <input
                type="month"
                aria-label={t("overview.month")}
                required
                value={month}
                onChange={(event) => {
                  if (event.target.value) setMonth(event.target.value);
                }}
              />
            </label>
            <IconLink
              to="/create-bill"
              icon="plus"
              label={t("nav.create")}
              className="primary-action"
            />
          </>
        }
      />
      <DataState />
      <section className="summary-grid" aria-label={t("overview.summary")}>
        <MetricCard
          label={t("overview.total")}
          value={available ? money(sumBills(period)) : "—"}
          icon="bills"
          featured
        >
          <p>
            {available
              ? t("overview.billCount", { count: period.length })
              : t("bills.waiting")}
          </p>
        </MetricCard>
        <MetricCard
          label={t("bills.spending")}
          value={available ? money(sumPaid(period)) : "—"}
          icon="check"
        >
          <p>
            {available
              ? t("overview.completedCount", { count: paid.length })
              : t("bills.waiting")}
          </p>
        </MetricCard>
        <MetricCard
          label={t("overview.unpaid")}
          value={available ? money(sumRemaining(pending)) : "—"}
          icon="clock"
        >
          <p>
            {available
              ? t("overview.pendingCount", { count: pending.length })
              : t("bills.waiting")}
            {available &&
              overdue.length > 0 &&
              t("overview.overdueCount", { count: overdue.length })}
          </p>
        </MetricCard>
        <MetricCard label={t("overview.income")} value="—" icon="wallet">
          <p>{t("overview.incomeNote")}</p>
          <p>{t("overview.accountsNote")}</p>
        </MetricCard>
      </section>
      <div className="overview-grid">
        <BillingChart
          bills={available ? bills : []}
          month={month}
          available={available}
        />
        <Panel
          title={t("bills.outstanding")}
          className="upcoming-panel"
          actions={
            <IconLink
              to="/home/bills?status=outstanding"
              icon="arrow"
              label={t("bills.viewOutstanding")}
            />
          }
        >
          <div className="bill-list">
            {available &&
              upcoming
                .slice(0, 3)
                .map((bill) => (
                  <BillListItem
                    key={bill.id}
                    bill={bill}
                    onSelect={setSelected}
                  />
                ))}
            {available && !upcoming.length && (
              <div className="empty-state compact-empty">
                <Icon name="check" />
                <p>{t("bills.noneOutstanding")}</p>
              </div>
            )}
            {!available && (
              <p className="unavailable-text muted">
                {loading ? t("common.loading") : t("bills.unavailable")}
              </p>
            )}
          </div>
        </Panel>
      </div>
      <Panel
        title={t("bills.recent")}
        className="recent-panel"
        actions={
          <IconLink
            to={`/home/bills?month=${month}`}
            icon="arrow"
            label={t("common.viewAll")}
          />
        }
      >
        {available ? (
          <BillTable bills={recent} />
        ) : (
          <p className="unavailable-text muted">
            {loading ? t("bills.loading") : t("bills.afterLoading")}
          </p>
        )}
      </Panel>
      {selected && (
        <BillDetails bill={selected} onClose={() => setSelected(null)} />
      )}
    </>
  );
}
