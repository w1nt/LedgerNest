import type { Bill } from "../types/billing";
import { currentLocale, t } from "../i18n/core.ts";

// 使用整数分累计，避免 0.1 + 0.2 一类浮点误差进入汇总金额。
export function cents(amount: string) {
  const negative = amount.startsWith("-");
  const [whole, fraction = ""] = (negative ? amount.slice(1) : amount).split(
    ".",
  );
  return (
    (negative ? -1 : 1) *
    (Number(whole) * 100 + Number(fraction.padEnd(2, "0").slice(0, 2)))
  );
}
export function money(value: number) {
  return new Intl.NumberFormat(currentLocale(), {
    style: "currency",
    currency: "USD",
    currencyDisplay: "narrowSymbol",
  }).format(value / 100);
}
export function dateLabel(value: string) {
  return new Intl.DateTimeFormat(currentLocale(), {
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(value));
}
export function fullDateLabel(value: string) {
  // 纯日期按本地日历解释，避免 YYYY-MM-DD 被当成 UTC 导致美洲时区少一天。
  const date = /^\d{4}-\d{2}-\d{2}$/u.test(value)
    ? new Date(`${value}T12:00:00`)
    : new Date(value);
  return new Intl.DateTimeFormat(currentLocale(), {
    year: "numeric",
    month: "short",
    day: "numeric",
  }).format(date);
}
export function monthKey(value: Date | string) {
  const date = typeof value === "string" ? new Date(value) : value;
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}
export function isOverdue(bill: Bill): boolean {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return (
    bill.settlementStatus !== "voided" &&
    cents(bill.remainingAmount) > 0 &&
    new Date(bill.dueAt) < today
  );
}
export const statusLabels = {
  get unpaid() {
    return t("status.unpaid");
  },
  get awaiting_confirmation() {
    return t("status.awaiting");
  },
  get completed() {
    return t("status.completed");
  },
  get voided() {
    return t("status.voided");
  },
};
export const allocatedPaid = (bill: Bill) =>
  bill.settlementStatus === "voided"
    ? 0
    : Math.min(cents(bill.amount), Math.max(0, cents(bill.confirmedAmount)));
export const sumPaid = (bills: Bill[]) =>
  bills.reduce((sum, bill) => sum + allocatedPaid(bill), 0);
export const sumRemaining = (bills: Bill[]) =>
  bills.reduce(
    (sum, bill) =>
      sum +
      (bill.settlementStatus === "voided" ? 0 : cents(bill.remainingAmount)),
    0,
  );
export const sumBills = (bills: Bill[]) =>
  bills.reduce(
    (sum, bill) =>
      sum + (bill.settlementStatus === "voided" ? 0 : cents(bill.amount)),
    0,
  );
