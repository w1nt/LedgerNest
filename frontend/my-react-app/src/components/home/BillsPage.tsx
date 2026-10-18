import { useI18n } from "../../i18n/LanguageContext";
import { useState } from "react";
import { useLocation, useSearchParams } from "react-router-dom";
import { useBills } from "../../context/BillsContext";
import { isOverdue, cents, monthKey, sumBills, money } from "../../lib/billing";
import BillTable from "../ui/BillTable";
import DataState from "../ui/DataState";
import Icon from "../ui/Icon";
import { filters } from "../../security/validation";
import PageHeader from "../ui/PageHeader";
import InfoDialog from "../ui/InfoDialog";
import SearchField from "../ui/SearchField";
import { IconButton, IconLink } from "../ui/IconAction";
export default function BillsPage() {
  const { t } = useI18n();
  const { bills, loading, error } = useBills();
  const [params, setParams] = useSearchParams();
  const location = useLocation();
  const [page, setPage] = useState(1);
  const { query, status, month } = filters(params);
  function filter(key: "q" | "status" | "month", value: string) {
    const next = new URLSearchParams(params);
    if (!value || value === "all") next.delete(key);
    else next.set(key, value);
    setParams(next, { replace: true });
    setPage(1);
  }
  const filtered = bills
    .filter((bill) => {
      const actual = bill.settlementStatus;
      return (
        `${bill.vendorName} ${bill.comment}`
          .toLocaleLowerCase()
          .includes(query.toLocaleLowerCase()) &&
        (status === "all" ||
          (status === "overdue"
            ? isOverdue(bill)
            : status === "outstanding"
              ? actual !== "voided" && cents(bill.remainingAmount) > 0
              : actual === status)) &&
        (!month || monthKey(bill.dueAt) === month)
      );
    })
    .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
  const pageCount = Math.max(1, Math.ceil(filtered.length / 8));
  const currentPage = Math.min(page, pageCount);
  const available = !loading && !error;
  return (
    <>
      <PageHeader
        title={t("nav.bills")}
        actions={
          <>
            <InfoDialog title={t("nav.bills")}>
              <p>{t("bills.note")}</p>
            </InfoDialog>
            <IconLink
              to="/create-bill"
              className="primary-action"
              icon="plus"
              label={t("nav.create")}
            />
          </>
        }
      />
      <DataState />
      {location.state?.created && (
        <p className="success-message" role="status">
          {t("bills.saved")}
        </p>
      )}
      <section className="panel bills-panel" aria-label={t("nav.bills")}>
        <div
          className="bill-tabs"
          role="group"
          aria-label={t("bills.statusFilter")}
        >
          {[
            { value: "all", label: t("common.all") },
            { value: "unpaid", label: t("status.unpaid") },
            { value: "awaiting_confirmation", label: t("status.confirmation") },
            { value: "completed", label: t("status.completed") },
            { value: "overdue", label: t("status.overdue") },
            { value: "voided", label: t("status.voided") },
          ].map((tab) => (
            <button
              key={tab.value}
              aria-pressed={status === tab.value}
              className={status === tab.value ? "active" : ""}
              onClick={() => filter("status", tab.value)}
            >
              {tab.label}
              {tab.value === "all" && available && <span>{bills.length}</span>}
            </button>
          ))}
        </div>
        <div className="table-toolbar">
          <SearchField
            className="table-search"
            label={t("bills.searchAria")}
            maxLength={600}
            placeholder={t("bills.searchPlaceholder")}
            value={query}
            onChange={(event) => filter("q", event.target.value)}
          />
          <label className="month-picker">
            <Icon name="clock" />
            <span className="sr-only">{t("bills.dueMonth")}</span>
            <input
              type="month"
              aria-label={t("bills.dueMonthAria")}
              value={month}
              onChange={(event) => filter("month", event.target.value)}
            />
          </label>
          {(query || month || status !== "all") && (
            <IconButton
              icon="close"
              label={t("bills.clearFilters")}
              onClick={() => {
                setParams({});
                setPage(1);
              }}
            />
          )}
        </div>
        {available ? (
          <BillTable
            bills={filtered.slice((currentPage - 1) * 8, currentPage * 8)}
          />
        ) : (
          <p className="unavailable-text muted">
            {loading ? t("common.loading") : t("bills.retry")}
          </p>
        )}
        <div className="table-pagination">
          <span>
            {available ? (
              <>
                {t("bills.totalCount", { count: filtered.length })}{" "}
                <strong>{money(sumBills(filtered))}</strong>
              </>
            ) : (
              t("common.unavailable")
            )}
          </span>
          <div>
            <IconButton
              icon="chevron"
              label={t("common.previous")}
              className="previous"
              disabled={currentPage === 1 || !available}
              onClick={() => setPage(currentPage - 1)}
            />
            <span>
              {currentPage} / {pageCount}
            </span>
            <IconButton
              icon="chevron"
              label={t("common.next")}
              disabled={currentPage === pageCount || !available}
              onClick={() => setPage(currentPage + 1)}
            />
          </div>
        </div>
      </section>
    </>
  );
}
