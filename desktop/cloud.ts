import { lstatSync, readFileSync, mkdtempSync, rmSync, existsSync } from "node:fs";
import { dirname, basename, resolve } from "node:path";
import { randomUUID } from "node:crypto";
import type { CloudState, CloudError } from "../shared/cloud.ts";
import type { KeyProtector } from "./key-store.ts";
import type { DeviceSession } from "./device-session.ts";
import type { DataTools } from "./data-tools.ts";
import { ProtectedConfig } from "./protected-config.ts";
import { GoogleDrive, driveId } from "./google-drive.ts";
import { authorizeGoogle, exchangeToken, cloudError, type OAuthClient, type GoogleTokens } from "./google-oauth.ts";
import { createBackup } from "./backup.ts";
import { maskCredential } from "./settings.ts";
import { object, text } from "./validation.ts";
import { privateDirectory, restrictFiles } from "./permissions.ts";
import { AppError } from "./errors.ts";
interface SavedCloud {
  version: 1; clientId: string; clientSecret: string; refreshToken: string;
  enabled: boolean; automatic: boolean; intervalHours: number; enabledAt: string | null;
  folderName: string; filePrefix: string; password: string; folderId: string | null;
  lastSuccessAt: string | null; retryAt: string | null; failures: number; lastError: CloudError | null;
}
const defaults = (): SavedCloud => ({ version: 1, clientId: "", clientSecret: "", refreshToken: "", enabled: false, automatic: false, intervalHours: 24, enabledAt: null, folderName: "", filePrefix: "", password: "", folderId: null, lastSuccessAt: null, retryAt: null, failures: 0, lastError: null });
function name(value: unknown, blank = false) {
  const result = text(value, 80, !blank);
  if ((result && (/[\u0000-\u001f\u007f<>:"/\\|?*]/u.test(result) || /[. ]$/u.test(result) || /^\.+$/u.test(result)))) throw cloudError("config");
  return result;
}
function date(value: unknown): value is string | null { return value === null || (typeof value === "string" && /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/u.test(value) && Number.isFinite(Date.parse(value))); }
function validate(value: unknown): SavedCloud {
  const v = object(value, Object.keys(defaults()));
  const token = (v: unknown, min: number, max: number) => typeof v === "string" && (v === "" || new RegExp(`^[\\x21-\\x7e]{${min},${max}}$`, "u").test(v));
  if (v.version !== 1 || !token(v.clientId, 12, 300) || (v.clientId && !/^[A-Za-z0-9_-]+\.apps\.googleusercontent\.com$/u.test(String(v.clientId))) || !token(v.clientSecret, 12, 1024) || !token(v.refreshToken, 12, 8192) || typeof v.enabled !== "boolean" || typeof v.automatic !== "boolean" || !Number.isInteger(v.intervalHours) || Number(v.intervalHours) < 1 || Number(v.intervalHours) > 720 || !date(v.enabledAt) || !date(v.lastSuccessAt) || !date(v.retryAt) || !Number.isInteger(v.failures) || Number(v.failures) < 0 || Number(v.failures) > 20 || (v.lastError !== null && !["auth", "network", "quota", "remote", "config", "canceled"].includes(String(v.lastError))) || typeof v.password !== "string" || (v.password && (v.password.length < 12 || v.password.length > 256))) throw cloudError("config");
  if (name(v.folderName, true) !== v.folderName || name(v.filePrefix, true) !== v.filePrefix || (v.folderId !== null && driveId(v.folderId) !== v.folderId)) throw cloudError("config");
  if ((v.enabled && (!v.clientId || !v.refreshToken || !v.password || !v.folderName || !v.filePrefix || !v.enabledAt)) || (v.automatic && !v.enabled)) throw cloudError("config");
  return v as unknown as SavedCloud;
}
export interface CloudDependencies {
  chooseClient(): Promise<string | undefined>;
  chooseDownload(): Promise<string | undefined>;
  authorize(client: OAuthClient, signal: AbortSignal): Promise<GoogleTokens>;
  refresh(client: OAuthClient, token: string, signal: AbortSignal): Promise<GoogleTokens>;
  drive?: (token: (force: boolean, signal: AbortSignal) => Promise<string>) => GoogleDrive;
  now?: () => number;
}
export function cloudDependencies(chooseClient: CloudDependencies["chooseClient"], chooseDownload: CloudDependencies["chooseDownload"], openBrowser: (url: string) => Promise<void>): CloudDependencies {
  return { chooseClient, chooseDownload, authorize: (client, signal) => authorizeGoogle(client, openBrowser, signal), refresh: (client, token, signal) => exchangeToken(client, { refresh_token: token, grant_type: "refresh_token" }, signal) };
}
export class CloudSync {
  private store: ProtectedConfig<SavedCloud>;
  private device: DeviceSession;
  private tools: DataTools;
  private deps: CloudDependencies;
  private drive: GoogleDrive;
  private now: () => number;
  private phase: CloudState["phase"] = "idle";
  private progress = 0;
  private access?: { token: string; until: number };
  private stopped = false;
  constructor(path: string, protector: KeyProtector, device: DeviceSession, tools: DataTools, dependencies: CloudDependencies) {
    this.store = new ProtectedConfig(path, "LNCLOUD01\n", protector, validate, defaults);
    this.device = device; this.tools = tools; this.deps = dependencies; this.now = dependencies.now || Date.now;
    this.drive = dependencies.drive ? dependencies.drive((force, signal) => this.token(force, signal)) : new GoogleDrive((force, signal) => this.token(force, signal));
  }
  private read() { try { return this.store.read(); } catch { throw cloudError("config"); } }
  private write(value: SavedCloud) { try { this.store.write(value); } catch { throw cloudError("config"); } }
  private snapshot(v: SavedCloud): CloudState {
    const due = v.enabled && v.automatic ? Math.max(Date.parse(v.lastSuccessAt || v.enabledAt!) + v.intervalHours * 3600000, v.retryAt ? Date.parse(v.retryAt) : 0) : null;
    return { configured: !!v.clientId, clientId: maskCredential(v.clientId), clientSecret: maskCredential(v.clientSecret), connected: !!v.refreshToken, enabled: v.enabled, automatic: v.automatic, intervalHours: v.intervalHours, folderName: v.folderName, filePrefix: v.filePrefix, passwordSet: !!v.password, lastSuccessAt: v.lastSuccessAt, nextSyncAt: due === null ? null : new Date(due).toISOString(), lastError: v.lastError, phase: this.phase, progress: this.progress };
  }
  state() { this.device.backgroundService(); return this.snapshot(this.read()); }
  private idle() { if (this.tools.busy) throw new AppError(409, "Another data operation is running.", "DATA_BUSY"); }
  private async operation<T>(phase: CloudState["phase"], action: (check: () => void, signal: AbortSignal) => Promise<T>) {
    this.idle();
    return this.tools.exclusive(async (check, signal) => {
      this.phase = phase; this.progress = 0;
      try { return await action(check, signal); }
      catch (error) {
        if (signal.aborted) throw cloudError("canceled");
        if (error instanceof AppError) {
          if (error.code === "CLOUD_AUTH") {
            this.access = undefined;
            const current = this.read();
            if (current.enabled || current.automatic || current.lastError !== "auth") {
              current.enabled = current.automatic = false; current.lastError = "auth"; this.write(current);
            }
          }
          throw error;
        }
        throw cloudError("network");
      } finally { this.phase = "idle"; this.progress = 0; }
    });
  }
  save(value: unknown) {
    this.device.requireService(); this.idle();
    const input = object(value, ["enabled", "automatic", "intervalHours", "folderName", "filePrefix", "password", "confirmation", "rememberConfirmed"]), previous = this.read();
    if (typeof input.enabled !== "boolean" || typeof input.automatic !== "boolean" || !Number.isInteger(input.intervalHours) || Number(input.intervalHours) < 1 || Number(input.intervalHours) > 720 || typeof input.password !== "string" || typeof input.confirmation !== "string" || typeof input.rememberConfirmed !== "boolean") throw cloudError("config");
    if (input.password && (input.password.length < 12 || input.password.length > 256 || input.password !== input.confirmation || !input.rememberConfirmed)) throw cloudError("config");
    const next = { ...previous, enabled: input.enabled, automatic: input.enabled && input.automatic, intervalHours: Number(input.intervalHours), folderName: name(input.folderName, !input.enabled), filePrefix: name(input.filePrefix, !input.enabled), password: input.password || previous.password, enabledAt: previous.enabledAt || (input.enabled ? new Date(this.now()).toISOString() : null) };
    if (next.folderName !== previous.folderName) next.folderId = null;
    if (next.enabled && !previous.enabled) next.enabledAt = new Date(this.now()).toISOString();
    validate(next); this.write(next); return this.snapshot(next);
  }
  importClient() {
    this.device.requireService();
    return this.operation("authorizing", async check => {
      const path = await this.deps.chooseClient(); check(); if (!path) return null; this.device.requireService();
      const stat = lstatSync(path);
      if (!stat.isFile() || stat.isSymbolicLink() || stat.size > 65536) throw cloudError("config");
      let installed: Record<string, unknown>;
      try { const json = JSON.parse(readFileSync(path, "utf8")); if (json.web || !json.installed) throw new Error(); installed = json.installed; }
      catch { throw cloudError("config"); }
      if (typeof installed.client_id !== "string" || !/^[A-Za-z0-9_-]{12,250}\.apps\.googleusercontent\.com$/u.test(installed.client_id) || typeof installed.client_secret !== "string" || !/^[\x21-\x7e]{12,1024}$/u.test(installed.client_secret) || (installed.auth_uri && installed.auth_uri !== "https://accounts.google.com/o/oauth2/auth" && installed.auth_uri !== "https://accounts.google.com/o/oauth2/v2/auth") || (installed.token_uri && installed.token_uri !== "https://oauth2.googleapis.com/token")) throw cloudError("config");
      const saved = this.read();
      saved.clientId = installed.client_id; saved.clientSecret = installed.client_secret;
      saved.refreshToken = ""; saved.folderId = null; saved.enabled = saved.automatic = false; saved.lastSuccessAt = saved.retryAt = null; saved.lastError = null; saved.failures = 0;
      this.access = undefined; this.write(saved); return { ...this.snapshot(saved), phase: "idle" as const, progress: 0 };
    });
  }
  connect() {
    this.device.requireService();
    return this.operation("authorizing", async (check, signal) => {
      const saved = this.read(); if (!saved.clientId) throw cloudError("config");
      const tokens = await this.deps.authorize(saved, signal); check(); this.device.requireService();
      if (!tokens.refreshToken) throw cloudError("auth");
      saved.refreshToken = tokens.refreshToken; saved.folderId = null; saved.lastError = null;
      // New authorization can select a different account: require explicit re-enabling before upload.
      saved.enabled = saved.automatic = false; saved.lastSuccessAt = saved.retryAt = null; saved.failures = 0;
      this.write(saved); this.access = { token: tokens.accessToken, until: this.now() + tokens.expiresIn * 1000 - 60000 };
      return { ...this.snapshot(saved), phase: "idle" as const, progress: 0 };
    });
  }
  disconnect() {
    this.device.requireService(); this.idle(); const saved = this.read();
    saved.refreshToken = ""; saved.password = ""; saved.folderId = null; saved.enabled = saved.automatic = false; saved.lastError = null; saved.retryAt = null;
    this.write(saved); this.access = undefined; return { ...this.snapshot(saved), phase: "idle" as const, progress: 0 };
  }
  cancel() { if (this.phase !== "idle") this.tools.cancel(); }
  locked() { this.access = undefined; }
  stop() { this.stopped = true; this.cancel(); this.locked(); }
  private async token(force: boolean, signal: AbortSignal) {
    if (this.access && !force && this.access.until > this.now()) return this.access.token;
    const saved = this.read(); if (!saved.refreshToken) throw cloudError("auth");
    const tokens = await this.deps.refresh(saved, saved.refreshToken, signal);
    if (signal.aborted) throw cloudError("canceled"); this.device.backgroundService();
    if (tokens.refreshToken && tokens.refreshToken !== saved.refreshToken) { saved.refreshToken = tokens.refreshToken; this.write(saved); }
    this.access = { token: tokens.accessToken, until: this.now() + tokens.expiresIn * 1000 - 60000 }; return tokens.accessToken;
  }
  async sync(manual = true) {
    const service = manual ? this.device.requireService() : this.device.backgroundService();
    const saved = this.read();
    if (!saved.enabled || !saved.refreshToken || !saved.password) throw cloudError("config");
    return this.operation("encrypting", async (check, signal) => {
      const root = dirname(this.tools.location.original); privateDirectory(root);
      const directory = mkdtempSync(resolve(root, ".cloud-"));
      if (dirname(directory) !== root || !basename(directory).startsWith(".cloud-")) throw cloudError("config");
      restrictFiles([directory]);
      try {
        const path = resolve(directory, "snapshot.lnbackup");
        await createBackup(service.store, path, saved.password); check(); this.device.backgroundService();
        this.phase = "uploading";
        const folder = await this.drive.folder(saved.folderName, signal, saved.folderId); check();
        if (folder !== saved.folderId) { Object.assign(saved, this.read()); saved.folderId = folder; this.write(saved); }
        const filename = saved.filePrefix + "-" + new Date(this.now()).toISOString().replaceAll(":", "-") + "-" + randomUUID().slice(0, 8) + ".lnbackup";
        await this.drive.upload(path, filename, folder, signal, value => { this.progress = value; }); check(); this.device.backgroundService();
        Object.assign(saved, this.read());
        saved.lastSuccessAt = new Date(this.now()).toISOString(); saved.retryAt = null; saved.lastError = null; saved.failures = 0;
        this.write(saved); return { ...this.snapshot(saved), phase: "idle" as const, progress: 0 };
      } catch (error) {
        const code = signal.aborted ? "canceled" : error instanceof AppError && error.code?.startsWith("CLOUD_") ? error.code.slice(6).toLowerCase() as CloudError : "network";
        Object.assign(saved, this.read());
        saved.lastError = ["auth", "network", "quota", "remote", "config", "canceled"].includes(code) ? code : "network";
        saved.failures = Math.min(20, saved.failures + 1);
        saved.retryAt = new Date(this.now() + Math.min(3600000, 300000 * 2 ** Math.min(saved.failures - 1, 4))).toISOString();
        if (saved.lastError === "auth") { saved.enabled = saved.automatic = false; this.access = undefined; }
        this.write(saved); throw error;
      } finally { rmSync(directory, { recursive: true, force: true }); }
    });
  }
  async tick() {
    if (this.stopped || this.tools.busy) return;
    try {
      this.device.backgroundService(); const saved = this.read();
      if (!saved.enabled || !saved.automatic) return;
      const due = Date.parse(saved.lastSuccessAt || saved.enabledAt!) + saved.intervalHours * 3600000;
      if (this.now() < due || (saved.retryAt && this.now() < Date.parse(saved.retryAt))) return;
      await this.sync(false);
    } catch { /* Polling must not log credentials, extend idle time, or produce unhandled rejections. */ }
  }
  list() {
    this.device.requireService();
    return this.operation("listing", async (check, signal) => {
      const saved = this.read(); if (!saved.refreshToken || !saved.folderName) throw cloudError("config");
      const folder = await this.drive.folder(saved.folderName, signal, saved.folderId); check();
      if (folder !== saved.folderId) { Object.assign(saved, this.read()); saved.folderId = folder; this.write(saved); }
      return this.drive.list(folder, signal);
    });
  }
  download(value: unknown) {
    this.device.requireService(); const input = object(value, ["id"]), id = driveId(input.id);
    return this.operation("downloading", async (check, signal) => {
      const saved = this.read(); if (!saved.refreshToken || !saved.folderId) throw cloudError("config");
      const target = await this.deps.chooseDownload(); check(); if (!target) return null;
      if (!target.toLowerCase().endsWith(".lnbackup")) throw new AppError(400, "Use .lnbackup.", "DATA_EXTENSION");
      this.device.backgroundService();
      if (existsSync(target)) throw new AppError(409, "Choose a new filename.", "DATA_EXISTS");
      const file = await this.drive.download(id, saved.folderId, target, signal); check();
      return { fileName: basename(target), records: 0, sourceName: file.name };
    });
  }
}
