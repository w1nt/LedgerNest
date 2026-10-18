import type { Bill } from "../types/billing.ts";
import { allocatedPaid, cents, monthKey } from "./billing.ts";

/** 图表与浮层共用整数分口径。单次遍历账单，不在每次鼠标移动时重复过滤列表。 */
export function trendBuckets(
  bills: readonly Bill[],
  month: string,
  range: number,
) {
  const [year, monthNumber] = month.split("-").map(Number);
  const buckets = Array.from({ length: range }, (_, index) => {
    const date = new Date(year, monthNumber - range + index, 1);
    return {
      key: monthKey(date),
      date,
      total: 0,
      paid: 0,
      remaining: 0,
      count: 0,
    };
  });
  const byMonth = new Map(buckets.map((bucket) => [bucket.key, bucket]));
  for (const bill of bills) {
    if (bill.settlementStatus === "voided") continue;
    const bucket = byMonth.get(monthKey(bill.dueAt));
    if (!bucket) continue;
    bucket.total += cents(bill.amount);
    bucket.paid += allocatedPaid(bill);
    bucket.count++;
  }
  for (const bucket of buckets) bucket.remaining = bucket.total - bucket.paid;
  return buckets;
}
