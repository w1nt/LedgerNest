import { AppError } from "./errors.ts";
export function object(
  value: unknown,
  keys: string[],
): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new AppError(400, "Invalid request.");
  const row = value as Record<string, unknown>;
  if (Object.keys(row).some((key) => !keys.includes(key)))
    throw new AppError(400, "Unexpected request field.");
  return row;
}
export function text(value: unknown, max: number, required = true): string {
  if (typeof value !== "string") throw new AppError(400, "Invalid text.");
  const s = value.trim();
  if (
    (required && !s) ||
    s.length > max ||
    /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f-\u009f\u202a-\u202e\u2066-\u2069]/u.test(
      s,
    )
  )
    throw new AppError(400, "Invalid text.");
  for (const char of s)
    if (char.codePointAt(0)! >= 0xd800 && char.codePointAt(0)! <= 0xdfff)
      throw new AppError(400, "Invalid text.");
  return s;
}
export function email(value: unknown) {
  const s = text(value, 254).toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/u.test(s))
    throw new AppError(400, "请输入有效的邮箱。");
  return s;
}
export function password(value: unknown, registration = false): string {
  if (
    typeof value !== "string" ||
    value.length < (registration ? 8 : 1) ||
    value.length > 128
  )
    throw new AppError(400, "密码长度须为 8 至 128 位。");
  return value;
}
export function cents(value: unknown) {
  if (typeof value !== "string" || !/^\d{1,9}(?:\.\d{1,2})?$/u.test(value))
    throw new AppError(400, "Invalid amount.");
  const [whole, frac = ""] = value.split(".");
  const n = BigInt(whole) * 100n + BigInt(frac.padEnd(2, "0"));
  if (n < 1n || n > 99999999999n)
    throw new AppError(400, "Amount is out of range.");
  return n;
}
export function money(value: unknown) {
  if (typeof value !== "bigint")
    throw new Error("Invalid stored monetary value");
  const n = value < 0n ? -value : value;
  return `${value < 0n ? "-" : ""}${n / 100n}.${String(n % 100n).padStart(2, "0")}`;
}
export function integer(value: unknown): number {
  if (
    typeof value !== "bigint" ||
    value < 0 ||
    value > BigInt(Number.MAX_SAFE_INTEGER)
  )
    throw new Error("Invalid stored integer");
  return Number(value);
}
/** Canonical UTC nanosecond text, including the fractional precision of imported Java dates. */
export function timestamp(value: unknown): string {
  if (
    typeof value !== "string" ||
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?(?:Z|[+-]\d{2}:\d{2})$/u.test(
      value,
    )
  )
    throw new AppError(400, "Invalid date.");
  const [y, m, d, h, mi, s] = [
    value.slice(0, 4),
    value.slice(5, 7),
    value.slice(8, 10),
    value.slice(11, 13),
    value.slice(14, 16),
    value.slice(17, 19),
  ].map(Number);
  const day = new Date(Date.UTC(y, m - 1, d));
  if (
    y < 1000 ||
    y > 9998 ||
    day.getUTCFullYear() !== y ||
    day.getUTCMonth() !== m - 1 ||
    day.getUTCDate() !== d ||
    h > 23 ||
    mi > 59 ||
    s > 59
  )
    throw new AppError(400, "Invalid date.");
  if (!value.endsWith("Z")) {
    const off = value.slice(-6);
    if (
      Number(off.slice(1, 3)) > 18 ||
      Number(off.slice(4)) > 59 ||
      (Number(off.slice(1, 3)) === 18 && Number(off.slice(4)) !== 0)
    )
      throw new AppError(400, "Invalid timezone.");
  }
  const date = new Date(value);
  if (
    !Number.isFinite(date.getTime()) ||
    date.getUTCFullYear() < 1000 ||
    date.getUTCFullYear() > 9998
  )
    throw new AppError(400, "Invalid date.");
  const fraction = (value.match(/\.(\d+)/u)?.[1] || "").padEnd(9, "0");
  return date.toISOString().slice(0, 19) + "." + fraction;
}
export const now = () => timestamp(new Date().toISOString());
