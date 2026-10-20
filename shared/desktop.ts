/** Renderer capability contract: no SQL, caller-supplied paths, arbitrary channels or Node handles. */
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
  cloudState(): Promise<Reply<import("./cloud.ts").CloudState>>;
  cloudImport(): Promise<Reply<import("./cloud.ts").CloudState | null>>;
  cloudConnect(): Promise<Reply<import("./cloud.ts").CloudState>>;
  cloudSave(value: import("./cloud.ts").CloudSettingsInput): Promise<Reply<import("./cloud.ts").CloudState>>;
  cloudSync(): Promise<Reply<import("./cloud.ts").CloudState>>;
  cloudDisconnect(): Promise<Reply<import("./cloud.ts").CloudState>>;
  cloudList(): Promise<Reply<import("./cloud.ts").CloudFile[]>>;
  cloudDownload(value: { id: string }): Promise<Reply<{ fileName: string } | null>>;
  cloudCancel(): Promise<Reply<null>>;
  backupLocation(): Promise<Reply<import("./data-tools.ts").BackupLocation>>;
  chooseBackupDirectory(): Promise<Reply<import("./data-tools.ts").BackupLocation | null>>;
  backupData(value: { password: string; confirmation: string }): Promise<Reply<import("./data-tools.ts").DataResult | null>>;
  exportRecords(value: { format: import("./data-tools.ts").ExportFormat; plaintextConfirmed: true; locale: "zh-CN" | "en-US" }): Promise<Reply<import("./data-tools.ts").DataResult | null>>;
  restoreData(value: { password: string; locale: "zh-CN" | "en-US" }): Promise<Reply<import("./data-tools.ts").DataResult | null>>;
  settings(): Promise<Reply<import("./settings.ts").SettingsSnapshot>>;
  saveSecurity(value: {
    idleMinutes: import("./settings.ts").IdleMinutes;
  }): Promise<Reply<import("./settings.ts").SettingsSnapshot>>;
  saveIntegration(
    value: import("./settings.ts").IntegrationUpdate,
  ): Promise<Reply<import("./settings.ts").SettingsSnapshot>>;
  removeIntegration(value: {
    kind: import("./settings.ts").IntegrationKind;
  }): Promise<Reply<import("./settings.ts").SettingsSnapshot>>;
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
