import { test } from "node:test";
import assert from "node:assert/strict";
import { trendBuckets } from "../src/lib/trends.ts";

function bill(overrides = {}) {
  return {
    id: 1,
    vendorName: "Sample",
    comment: "",
    amount: "100.00",
    settlementStatus: "unpaid",
    settlementVersion: 0,
    confirmedAmount: "0.00",
    processingAmount: "0.00",
    remainingAmount: "100.00",
    overpaidAmount: "0.00",
    createdAt: new Date(2026, 0, 1, 12).toISOString(),
    dueAt: new Date(2026, 0, 20, 12).toISOString(),
    ...overrides,
  };
}
test("图表和浮层使用相同结算口径：部分付款、超付、负净额及作废", () => {
  const entries = [
    bill({
      settlementStatus: "awaiting_confirmation",
      confirmedAmount: "40.00",
      processingAmount: "60.00",
      remainingAmount: "60.00",
    }),
    bill({
      id: 2,
      settlementStatus: "completed",
      confirmedAmount: "120.00",
      remainingAmount: "0.00",
      overpaidAmount: "20.00",
    }),
    bill({
      id: 3,
      amount: "20.00",
      confirmedAmount: "-10.00",
      remainingAmount: "20.00",
    }),
    bill({ id: 4, settlementStatus: "voided", remainingAmount: "0.00" }),
  ];
  const before = structuredClone(entries);
  const latest = trendBuckets(entries, "2026-01", 3).at(-1);
  assert.deepEqual(
    {
      total: latest.total,
      paid: latest.paid,
      remaining: latest.remaining,
      count: latest.count,
    },
    { total: 22000, paid: 14000, remaining: 8000, count: 3 },
  );
  assert.deepEqual(entries, before);
});
test("跨年月份有序，空月份补零，范围外数据不进入汇总", () => {
  const entries = [
    bill(),
    bill({ id: 2, dueAt: new Date(2025, 11, 15, 12).toISOString() }),
    bill({ id: 3, dueAt: new Date(2025, 9, 15, 12).toISOString() }),
  ];
  const result = trendBuckets(entries, "2026-01", 3);
  assert.deepEqual(
    result.map((bucket) => bucket.key),
    ["2025-11", "2025-12", "2026-01"],
  );
  assert.deepEqual(
    result.map((bucket) => bucket.total),
    [0, 10000, 10000],
  );
  assert.deepEqual(
    result.map((bucket) => bucket.count),
    [0, 1, 1],
  );
  assert.equal(trendBuckets(entries, "2026-01", 6)[0].key, "2025-08");
});
test("小数金额使用整数分，柱形两部分之和始终等于总额", () => {
  const result = trendBuckets(
    [
      bill({
        amount: "0.10",
        confirmedAmount: "0.10",
        remainingAmount: "0.00",
        settlementStatus: "completed",
      }),
      bill({ id: 2, amount: "0.20", remainingAmount: "0.20" }),
    ],
    "2026-01",
    6,
  );
  const latest = result.at(-1);
  assert.equal(latest.total, 30);
  assert.equal(latest.paid, 10);
  assert.equal(latest.remaining, 20);
  for (const bucket of result)
    assert.equal(bucket.paid + bucket.remaining, bucket.total);
});
