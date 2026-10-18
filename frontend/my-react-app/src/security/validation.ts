import type {
  Bill,
  CreateBillRequest,
  RegisterRequest,
  User,
} from "../types/billing.ts";

import { t, isMessageKey } from "../i18n/core.ts";
import type { MessageKey, MessageParams } from "../i18n/types.ts";

// 保存消息键而非已翻译的文本；切换语言后，已有错误也使用当前语言。
export class ValidationError extends Error {
  readonly messageKey: MessageKey;
  readonly params: MessageParams;
  constructor(key: MessageKey, params: MessageParams = {}) {
    super(key);
    this.name = "ValidationError";
    this.messageKey = key;
    this.params = params;
  }
  localizedMessage() {
    const { fieldKey, ...params } = this.params;
    return t(
      this.messageKey,
      fieldKey
        ? {
            ...params,
            field: isMessageKey(String(fieldKey))
              ? t(fieldKey as MessageKey)
              : fieldKey,
          }
        : params,
    );
  }
}
export function hasUnsafeControls(value: string) {
  for (const character of value) {
    const code = character.codePointAt(0)!;
    if (
      (code < 32 && ![9, 10, 13].includes(code)) ||
      (code >= 127 && code <= 159) ||
      (code >= 0x202a && code <= 0x202e) ||
      (code >= 0x2066 && code <= 0x2069) ||
      (code >= 0xd800 && code <= 0xdfff)
    )
      return true;
  }
  return false;
}
export function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new ValidationError("validation.data");
  return value as Record<string, unknown>;
}
export function text(
  value: unknown,
  field: string,
  max: number,
  required = true,
): string {
  if (typeof value !== "string")
    throw new ValidationError("validation.fieldFormat", { fieldKey: field });
  const result = value.trim();
  if ((required && !result) || result.length > max || hasUnsafeControls(result))
    throw new ValidationError("validation.fieldLength", { fieldKey: field });
  // 不过滤引号、SQL 关键字或 HTML 字符：合法文本可保留，渲染必须用 React 文本节点。
  return result;
}
export function email(value: unknown): string {
  const result = text(value, "field.email", 254).toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/u.test(result))
    throw new ValidationError("validation.email");
  return result;
}
export function password(value: unknown, registration = false): string {
  // 密码不 trim 或改写；最大长度与后端一致，允许密码管理器与粘贴。
  if (
    typeof value !== "string" ||
    value.length < (registration ? 8 : 1) ||
    value.length > 128
  )
    throw new ValidationError("validation.password");
  return value;
}
export function amount(value: unknown): string {
  const result =
    typeof value === "number" && Number.isFinite(value) ? String(value) : value;
  if (typeof result !== "string" || !/^\d{1,9}(?:\.\d{1,2})?$/u.test(result))
    throw new ValidationError("validation.amount");
  const [whole, fraction = ""] = result.split(".");
  const total = Number(whole) * 100 + Number(fraction.padEnd(2, "0"));
  if (!Number.isSafeInteger(total) || total < 1 || total > 99999999999)
    throw new ValidationError("validation.amountRange");
  return `${Math.floor(total / 100)}.${String(total % 100).padStart(2, "0")}`;
}
export function calendarDate(value: unknown): string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/u.test(value))
    throw new ValidationError("validation.date");
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    year < 1000 ||
    year > 9998 ||
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() + 1 !== month ||
    date.getUTCDate() !== day
  )
    throw new ValidationError("validation.dateRange");
  return value;
}
export function timestamp(value: unknown): string {
  if (
    typeof value !== "string" ||
    value.length > 40 ||
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?(?:Z|[+-]\d{2}:\d{2})$/u.test(
      value,
    )
  )
    throw new ValidationError("validation.timestamp");
  calendarDate(value.slice(0, 10));
  if (
    Number(value.slice(11, 13)) > 23 ||
    Number(value.slice(14, 16)) > 59 ||
    Number(value.slice(17, 19)) > 59
  )
    throw new ValidationError("validation.timestamp");
  const date = new Date(value);
  if (
    !Number.isFinite(date.getTime()) ||
    date.getUTCFullYear() < 1000 ||
    date.getUTCFullYear() > 9998
  )
    throw new ValidationError("validation.timestampRange");
  return value;
}
export function localDueDate(value: string): string {
  calendarDate(value);
  return timestamp(new Date(`${value}T23:59:00`).toISOString());
}
function id(value: unknown): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 1)
    throw new ValidationError("validation.id");
  return value;
}
export function parseUser(value: unknown): User {
  const row = record(value);
  // 只挑选实际展示字段，忽略 password、token、角色及原型相关属性。
  return {
    id: id(row.id),
    username: text(row.username, "field.username", 100),
    email: email(row.email),
    address: text(row.address ?? "", "field.address", 250, false),
  };
}
export function parseBills(value: unknown): Bill[] {
  if (!Array.isArray(value) || value.length > 10000)
    throw new ValidationError("validation.billList");
  const ids = new Set<number>();
  return value.map((value) => {
    const row = record(value);
    const billId = id(row.id);
    if (
      ids.has(billId) ||
      "status" in row ||
      typeof row.settlementStatus !== "string" ||
      !["unpaid", "awaiting_confirmation", "completed", "voided"].includes(
        row.settlementStatus,
      ) ||
      typeof row.settlementVersion !== "number" ||
      !Number.isSafeInteger(row.settlementVersion) ||
      row.settlementVersion < 0
    )
      throw new ValidationError("validation.billStatus");
    ids.add(billId);
    const total = amount(row.amount);
    const confirmed = balance(row.confirmedAmount, true);
    const processing = balance(row.processingAmount);
    const remaining = balance(row.remainingAmount);
    const overpaid = balance(row.overpaidAmount);
    const due = row.settlementStatus === "voided" ? 0 : decimalCents(total);
    if (
      decimalCents(remaining) !==
        Math.max(0, due - Math.max(0, decimalCents(confirmed))) ||
      decimalCents(overpaid) !== Math.max(0, decimalCents(confirmed) - due) ||
      (row.settlementStatus === "completed" &&
        (decimalCents(remaining) !== 0 || decimalCents(processing) !== 0)) ||
      (row.settlementStatus === "awaiting_confirmation" &&
        decimalCents(processing) <= 0) ||
      (row.settlementStatus === "unpaid" &&
        (decimalCents(remaining) <= 0 || decimalCents(processing) !== 0))
    )
      throw new ValidationError("validation.settlement");
    return {
      id: billId,
      amount: total,
      vendorName: text(row.vendorName, "field.billName", 100),
      comment: text(row.comment ?? "", "field.comment", 500, false),
      settlementStatus: row.settlementStatus as Bill["settlementStatus"],
      settlementVersion: row.settlementVersion,
      confirmedAmount: confirmed,
      processingAmount: processing,
      remainingAmount: remaining,
      overpaidAmount: overpaid,
      createdAt: timestamp(row.createdAt),
      dueAt: timestamp(row.dueAt),
    };
  });
}
function decimalCents(value: string): number {
  return Number(value.replace(".", ""));
}
function balance(value: unknown, signed = false): string {
  if (
    typeof value !== "string" ||
    !(signed ? /^-?\d{1,13}\.\d{2}$/u : /^\d{1,13}\.\d{2}$/u).test(value) ||
    !Number.isSafeInteger(decimalCents(value))
  )
    throw new ValidationError("validation.balance");
  return value;
}
export const BILL_PAGE_SIZE = 100;
export function parseBillPage(value: unknown, requestedPage: number) {
  const row = record(value);
  if (
    !Number.isSafeInteger(row.total) ||
    typeof row.total !== "number" ||
    row.total < 0 ||
    row.total > 10000 ||
    row.page !== requestedPage ||
    row.size !== BILL_PAGE_SIZE ||
    row.pages !== Math.ceil(row.total / BILL_PAGE_SIZE) ||
    requestedPage > Math.max(1, Number(row.pages)) ||
    !Array.isArray(row.items) ||
    row.items.length !==
      Math.min(
        BILL_PAGE_SIZE,
        Math.max(0, row.total - (requestedPage - 1) * BILL_PAGE_SIZE),
      )
  )
    throw new ValidationError("validation.page");
  return {
    items: parseBills(row.items),
    total: row.total,
    pages: Number(row.pages),
  };
}
export function billRequest(value: CreateBillRequest): CreateBillRequest {
  return {
    amount: amount(value.amount),
    vendorName: text(value.vendorName, "field.billName", 100),
    comment: text(value.comment, "field.comment", 500, false),
    dueAt: timestamp(value.dueAt),
  };
}
export function registerRequest(value: RegisterRequest): RegisterRequest {
  const secret = password(value.password, true);
  if (secret !== value.confirm)
    throw new ValidationError("validation.passwordMatch");
  return {
    username: text(value.username, "field.username", 100),
    email: email(value.email),
    address: text(value.address, "field.address", 250, false),
    password: secret,
    confirm: secret,
  };
}
export function filters(params: URLSearchParams) {
  const query = Array.from((params.get("q") || "").slice(0, 600))
    .filter((character) => !hasUnsafeControls(character))
    .join("");
  const rawStatus = params.get("status") || "all";
  const status = [
    "all",
    "unpaid",
    "awaiting_confirmation",
    "completed",
    "voided",
    "outstanding",
    "overdue",
  ].includes(rawStatus)
    ? rawStatus
    : "all";
  const rawMonth = params.get("month") || "";
  const month =
    /^(?:[1-9]\d{3})-(?:0[1-9]|1[0-2])$/u.test(rawMonth) &&
    Number(rawMonth.slice(0, 4)) <= 9998
      ? rawMonth
      : "";
  return { query, status, month };
}
export function safeReturnPath(value: unknown): string {
  const fallback = "/home/homepage";
  if (!value || typeof value !== "object") return fallback;
  const from = (value as Record<string, unknown>).from;
  if (!from || typeof from !== "object") return fallback;
  const row = from as Record<string, unknown>;
  if (
    typeof row.pathname !== "string" ||
    ![
      "/home/homepage",
      "/home/bills",
      "/home/settings",
      "/create-bill",
    ].includes(row.pathname)
  )
    return fallback;
  if (
    row.search !== undefined &&
    (typeof row.search !== "string" ||
      row.search.length > 2048 ||
      (row.search && !row.search.startsWith("?")))
  )
    return fallback;
  const result = new URLSearchParams();
  if (row.pathname === "/home/bills") {
    const { query, status, month } = filters(
      new URLSearchParams(String(row.search || "")),
    );
    if (query) result.set("q", query);
    if (status !== "all") result.set("status", status);
    if (month) result.set("month", month);
  }
  return `${row.pathname}${result.size ? `?${result}` : ""}`;
}
