import type { Bill } from "../shared/billing.ts";
import type { ExportFormat } from "../shared/data-tools.ts";
/** Fixed public DTO allowlist: never serialize users, password hashes, keys, or internal operation responses. */
const columns = ["id", "vendorName", "amount", "currency", "comment", "dueAt", "createdAt", "settlementStatus", "settlementVersion", "confirmedAmount", "processingAmount", "remainingAmount", "overpaidAmount"] as const;
export function serializeRecords(bills: Bill[], format: ExportFormat, locale: "zh-CN" | "en-US") {
  const rows = bills.map(b => ({ id: b.id, vendorName: b.vendorName, amount: b.amount, currency: "USD", comment: b.comment, dueAt: b.dueAt, createdAt: b.createdAt, settlementStatus: b.settlementStatus, settlementVersion: b.settlementVersion, confirmedAmount: b.confirmedAmount, processingAmount: b.processingAmount, remainingAmount: b.remainingAmount, overpaidAmount: b.overpaidAmount }));
  if (format === "json") return JSON.stringify({ format: "ledgernest-records", version: 1, exportedAt: new Date().toISOString(), records: rows }, null, 2) + "\n";
  const cell = (value: string | number) => {
    let text = String(value);
    // Quoting alone does not neutralize spreadsheet formulas. JSON preserves exact source text.
    if (/^[\s\u0000-\u001f]*[=+@-]/u.test(text) || /^[\t\r\n]/u.test(text)) text = "'" + text;
    return '"' + text.replaceAll('"', '""') + '"';
  };
  const headers = locale === "zh-CN" ? ["记录编号", "收款方", "金额", "币种", "备注", "到期时间", "创建时间", "结算状态", "结算版本", "已确认金额", "处理中金额", "剩余金额", "超付金额"] : columns;
  const states = { unpaid: "待支付", awaiting_confirmation: "已支付待确认", completed: "完成", voided: "已作废" };
  return "\ufeff" + headers.join(",") + "\r\n" + rows.map(row => columns.map(key => cell(key === "settlementStatus" && locale === "zh-CN" ? states[row.settlementStatus] : row[key])).join(",")).join("\r\n") + (rows.length ? "\r\n" : "");
}
