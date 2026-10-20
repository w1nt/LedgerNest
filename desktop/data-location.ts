import { existsSync, lstatSync, readFileSync, writeFileSync, renameSync, unlinkSync } from "node:fs";
import { dirname, isAbsolute, resolve } from "node:path";
import { randomUUID } from "node:crypto";
import type { KeyProtector } from "./key-store.ts";
import { privateDirectory, restrictFiles } from "./permissions.ts";
import { syncFile } from "./database.ts";
import { AppError } from "./errors.ts";
import { object } from "./validation.ts";
interface Location { version: 1; directory: string | null; active: string | null }
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u;
const marker = Buffer.from("LNDATA01\n");
/** The active DB selector is atomic: a crash can select the old or complete new DB, never half a key pair. */
export class DataLocation {
  readonly path: string;
  readonly original: string;
  private protector: KeyProtector;
  constructor(original: string, protector: KeyProtector) {
    this.original = original; this.protector = protector;
    this.path = original + ".data-settings";
  }
  private read(): Location {
    try {
      let info;
      try { info = lstatSync(this.path); } catch (e) {
        if ((e as NodeJS.ErrnoException).code === "ENOENT") return { version: 1, directory: null, active: null };
        throw e;
      }
      if (!info.isFile() || info.isSymbolicLink() || info.nlink !== 1 || info.size > 32768 || !this.protector.available()) throw new Error();
      const bytes = readFileSync(this.path);
      if (!bytes.subarray(0, marker.length).equals(marker)) throw new Error();
      const v = object(JSON.parse(this.protector.unprotect(bytes.subarray(marker.length))), ["version", "directory", "active"]);
      if (v.version !== 1 || !(v.directory === null || (typeof v.directory === "string" && isAbsolute(v.directory) && v.directory.length <= 4096 && !/[\u0000-\u001f]/u.test(v.directory))) || !(v.active === null || (typeof v.active === "string" && uuid.test(v.active)))) throw new Error();
      return v as unknown as Location;
    } catch {
      throw new AppError(503, "Backup configuration could not be opened; it was not reset.", "DATA_CONFIG");
    }
  }
  private write(value: Location) {
    const stage = this.path + ".writing-" + randomUUID();
    try {
      if (!this.protector.available()) throw new Error();
      const bytes = Buffer.concat([marker, this.protector.protect(JSON.stringify(value))]);
      privateDirectory(dirname(this.path));
      writeFileSync(stage, bytes, { flag: "wx", mode: 0o600 });
      restrictFiles([stage]);
      syncFile(stage);
      renameSync(stage, this.path);
    } catch {
      throw new AppError(503, "Backup configuration could not be saved.", "DATA_CONFIG");
    } finally { if (existsSync(stage)) unlinkSync(stage); }
  }
  get() { return { directory: this.read().directory }; }
  setDirectory(directory: string) {
    if (!isAbsolute(directory) || directory.length > 4096 || /[\u0000-\u001f]/u.test(directory)) throw new AppError(400, "Invalid directory.");
    const stat = lstatSync(directory);
    if (!stat.isDirectory() || stat.isSymbolicLink()) throw new AppError(400, "Choose a local directory.", "DATA_DIRECTORY");
    this.write({ ...this.read(), directory });
    return this.get();
  }
  restoredPath(id: string) {
    if (!uuid.test(id)) throw new Error("Invalid recovery ID.");
    return resolve(this.original + ".restores", id + ".sqlite");
  }
  activePath() {
    const id = this.read().active;
    if (!id) return this.original;
    const target = this.restoredPath(id);
    // Missing recovery files must never silently create an empty replacement.
    for (const path of [target, target + ".key"]) {
      const stat = lstatSync(path);
      if (!stat.isFile() || stat.isSymbolicLink() || stat.nlink !== 1) throw new Error("Restored database is unavailable.");
    }
    return target;
  }
  activate(id: string) {
    const target = this.restoredPath(id);
    for (const path of [target, target + ".key"]) {
      const stat = lstatSync(path);
      if (!stat.isFile() || stat.isSymbolicLink() || stat.nlink !== 1) throw new Error("Incomplete restored database.");
    }
    this.write({ ...this.read(), active: id });
  }
}
