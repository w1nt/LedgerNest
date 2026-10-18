/** Renderer capability contract: no SQL, paths, arbitrary channels or Node handles. */
import type { Bill, CreateBillRequest, User } from "./billing.ts";
export type { Bill, CreateBillRequest, User };
export interface DeviceStatus {
  platform: "windows" | "macos" | "unsupported";
  availability:
    | "available"
    | "not_configured"
    | "disabled"
    | "busy"
    | "unavailable"
    | "unsupported";
}
export interface BillPage {
  items: Bill[];
  page: number;
  size: number;
  total: number;
  pages: number;
}
export type Reply<T> =
  | { ok: true; value: T }
  | { ok: false; error: { status: number; message: string; code?: string } };
export interface DesktopBridge {
  deviceStatus(): Promise<Reply<DeviceStatus>>;
  unlock(value: { locale: "zh-CN" | "en-US" }): Promise<Reply<User>>;
  onLocked(listener: () => void): () => void;
  currentUser(): Promise<Reply<User>>;
  logout(): Promise<Reply<null>>;
  billPage(value: { page: number }): Promise<Reply<BillPage>>;
  createBill(value: {
    bill: CreateBillRequest;
    idempotencyKey: string;
  }): Promise<Reply<Bill>>;
}
