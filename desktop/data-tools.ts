import { mkdtempSync, rmSync, existsSync, lstatSync, openSync, readSync, writeSync, closeSync, fsyncSync, unlinkSync, writeFileSync } from "node:fs";
import { basename, dirname, extname, resolve } from "node:path";
import { randomUUID } from "node:crypto";
import type { DeviceSession } from "./device-session.ts";
import type { KeyProtector } from "./key-store.ts";
import { openVault } from "./vault.ts";
import { createBackup, restoreBackup } from "./backup.ts";
import { DataLocation } from "./data-location.ts";
import { privateDirectory, restrictFiles } from "./permissions.ts";
import { serializeRecords } from "./exports.ts";
import { AppError } from "./errors.ts";
import { object } from "./validation.ts";
import type { ExportFormat } from "../shared/data-tools.ts";
export interface DataDialogs {
  directory(): Promise<string | undefined>;
  save(extension: string, directory: string | null): Promise<string | undefined>;
  open(): Promise<string | undefined>;
  confirmRestore(records: number, locale: "zh-CN" | "en-US"): Promise<boolean>;
}
function canceled() { return new AppError(409, "Data operation canceled.", "DATA_CANCELED"); }
function password(value: unknown) {
  if (typeof value !== "string" || value.length < 12 || value.length > 256) throw new AppError(400, "Use a 12–256 character backup passphrase.", "DATA_PASSWORD");
  return value;
}
/** Copy to an exclusive output on the chosen filesystem. No hard-link support required there. */
function publish(source: string, target: string) {
  let output: number | undefined, input: number | undefined, created = false;
  const buffer = Buffer.alloc(128 * 1024);
  try {
    output = openSync(target, "wx", 0o600); created = true;
    restrictFiles([target]);
    input = openSync(source, "r");
    let n: number;
    while ((n = readSync(input, buffer, 0, buffer.length, null))) {
      let offset = 0;
      while (offset < n) offset += writeSync(output, buffer, offset, n - offset);
    }
    fsyncSync(output);
  } catch (e) {
    if (output !== undefined) { closeSync(output); output = undefined; }
    if (created) unlinkSync(target);
    if ((e as NodeJS.ErrnoException).code === "EEXIST") throw new AppError(409, "Choose a new filename; existing files are never overwritten.", "DATA_EXISTS");
    throw e;
  } finally {
    if (input !== undefined) closeSync(input);
    if (output !== undefined) closeSync(output);
    buffer.fill(0);
  }
}
/** Narrow main-process capabilities; all paths originate in native dialogs or protected local metadata. */
export class DataTools {
  private pending?: AbortController;
  readonly location: DataLocation;
  private device: DeviceSession;
  private schema: string;
  private protector: KeyProtector;
  private dialogs: DataDialogs;
  private verify: (locale: "zh-CN" | "en-US", signal: AbortSignal) => Promise<void>;
  constructor(location: DataLocation, device: DeviceSession, schema: string, protector: KeyProtector, dialogs: DataDialogs, verify: (locale: "zh-CN" | "en-US", signal: AbortSignal) => Promise<void>) {
    this.location = location; this.device = device; this.schema = schema; this.protector = protector; this.dialogs = dialogs; this.verify = verify;
  }
  get busy() { return !!this.pending; }
  cancel() { this.pending?.abort(); }
  async exclusive<T>(action: (check: () => void, signal: AbortSignal) => Promise<T>) {
    if (this.pending) throw new AppError(409, "Another data operation is in progress.", "DATA_BUSY");
    const controller = new AbortController(); this.pending = controller;
    const check = () => { if (controller.signal.aborted) throw canceled(); };
    try { return await action(check, controller.signal); }
    finally { if (this.pending === controller) this.pending = undefined; }
  }
  state() { this.device.requireService(); return this.location.get(); }
  chooseDirectory() {
    this.device.requireService();
    return this.exclusive(async check => {
      const chosen = await this.dialogs.directory(); check(); this.device.requireService();
      return chosen ? this.location.setDirectory(chosen) : null;
    });
  }
  backup(value: unknown) {
    const input = object(value, ["password", "confirmation"]), passphrase = password(input.password);
    if (input.confirmation !== passphrase) throw new AppError(400, "Backup passphrases do not match.", "DATA_PASSWORD_MATCH");
    const service = this.device.requireService();
    return this.exclusive(async check => {
      const target = await this.dialogs.save("lnbackup", this.location.get().directory);
      check(); if (!target) return null;
      this.device.requireService();
      if (extname(target).toLowerCase() !== ".lnbackup") throw new AppError(400, "Use the .lnbackup extension.", "DATA_EXTENSION");
      if (existsSync(target)) throw new AppError(409, "Choose a new filename.", "DATA_EXISTS");
      const root = dirname(this.location.original); privateDirectory(root);
      const temporary = mkdtempSync(resolve(root, ".backup-"));
      if (dirname(temporary) !== root || !basename(temporary).startsWith(".backup-")) throw new Error("Unsafe snapshot directory.");
      restrictFiles([temporary]);
      try {
        const source = resolve(temporary, "snapshot.lnbackup");
        await createBackup(service.store, source, passphrase); check();
        this.device.requireService();
        const records = service.billPage({ page: 1 }).total;
        publish(source, target);
        return { fileName: basename(target), records };
      } finally { rmSync(temporary, { recursive: true, force: true }); }
    });
  }
  export(value: unknown) {
    const input = object(value, ["format", "plaintextConfirmed", "locale"]);
    if ((input.locale !== "zh-CN" && input.locale !== "en-US") || !["csv", "json"].includes(String(input.format)) || input.plaintextConfirmed !== true) throw new AppError(400, "Confirm the plaintext export.", "DATA_PLAINTEXT");
    const format = input.format as ExportFormat;
    const service = this.device.requireService();
    return this.exclusive(async check => {
      // Plaintext exports are deliberately not defaulted into the cloud backup directory.
      const target = await this.dialogs.save(format, null); check();
      if (!target) return null;
      this.device.requireService();
      if (extname(target).toLowerCase() !== "." + format) throw new AppError(400, "Use the selected file extension.", "DATA_EXTENSION");
      // Collect all pages under one read transaction; never export only the visible page.
      const bills = service.store.transaction(() => {
        const first = service.billPage({ page: 1 }), rows = [...first.items];
        for (let page = 2; page <= first.pages; page++) rows.push(...service.billPage({ page }).items);
        if (rows.length !== first.total) throw new Error("Incomplete export.");
        return rows;
      });
      const bytes = Buffer.from(serializeRecords(bills, format, input.locale as "zh-CN" | "en-US"), "utf8");
      let fd: number | undefined, created = false;
      try {
        fd = openSync(target, "wx", 0o600); created = true; restrictFiles([target]);
        writeFileSync(fd, bytes); fsyncSync(fd);
      } catch (e) {
        if (fd !== undefined) { closeSync(fd); fd = undefined; }
        if (created) unlinkSync(target);
        if ((e as NodeJS.ErrnoException).code === "EEXIST") throw new AppError(409, "Choose a new filename.", "DATA_EXISTS");
        throw e;
      } finally { if (fd !== undefined) closeSync(fd); bytes.fill(0); }
      return { fileName: basename(target), records: bills.length };
    });
  }
  restore(value: unknown) {
    const input = object(value, ["password", "locale"]), passphrase = password(input.password);
    if (input.locale !== "zh-CN" && input.locale !== "en-US") throw new AppError(400, "Invalid locale.");
    const locale = input.locale;
    return this.exclusive(async (check, signal) => {
      // Works from the login screen, even when the original DB/key cannot be opened.
      await this.verify(locale, signal); check();
      const source = await this.dialogs.open(); check(); if (!source) return null;
      const stat = lstatSync(source);
      if (!stat.isFile() || stat.isSymbolicLink()) throw new AppError(400, "Choose a downloaded backup file.", "DATA_RESTORE");
      const id = randomUUID(), target = this.location.restoredPath(id);
      let activated = false;
      try {
        try { await restoreBackup(source, target, passphrase, this.schema, this.protector); }
        catch { throw new AppError(400, "Backup could not be authenticated or opened. Check its passphrase and format.", "DATA_RESTORE"); }
        check();
        const restored = openVault(target, this.schema, this.protector);
        let records: number;
        try {
          const profiles = Number(restored.store.one("SELECT count(*) AS n FROM users")!.n);
          if (profiles > 1) throw new AppError(409, "Multiple profiles are not supported.", "PROFILE_REQUIRED");
          records = Number(restored.store.one("SELECT count(*) AS n FROM bills")!.n);
          if (records > 10000) throw new AppError(400, "Backup exceeds the record limit.", "DATA_RESTORE");
        } finally { restored.close(); }
        if (!(await this.dialogs.confirmRestore(records, locale))) return null;
        check();
        // Close old handles before atomically selecting the validated DB. Old files remain intact.
        this.device.lock();
        this.location.activate(id); activated = true;
        return { fileName: basename(source), records };
      } finally {
        if (!activated) for (const suffix of ["", ".key", "-wal", "-shm"]) {
          const file = target + suffix;
          if (existsSync(file)) unlinkSync(file);
        }
      }
    });
  }
}
