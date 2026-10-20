import { lstatSync, readFileSync, writeFileSync, existsSync, renameSync, unlinkSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { dirname } from "node:path";
import type { KeyProtector } from "./key-store.ts";
import { privateDirectory, restrictFiles } from "./permissions.ts";
import { syncFile } from "./database.ts";
/** Small OS-protected configuration; no plaintext staging and no silent reset on corruption. */
export class ProtectedConfig<T> {
  private path: string;
  private marker: Buffer;
  private protector: KeyProtector;
  private validate: (value: unknown) => T;
  private defaults: () => T;
  constructor(path: string, marker: string, protector: KeyProtector, validate: (value: unknown) => T, defaults: () => T) {
    this.path = path; this.marker = Buffer.from(marker); this.protector = protector; this.validate = validate; this.defaults = defaults;
  }
  private check() {
    const info = lstatSync(this.path);
    if (!info.isFile() || info.isSymbolicLink() || info.nlink !== 1 || info.size > 65536) throw new Error("Unsafe protected configuration.");
  }
  read(): T {
    try { this.check(); } catch (e) {
      if ((e as NodeJS.ErrnoException).code === "ENOENT") return this.defaults();
      throw e;
    }
    if (!this.protector.available()) throw new Error("OS protection unavailable.");
    const bytes = readFileSync(this.path);
    if (!bytes.subarray(0, this.marker.length).equals(this.marker)) throw new Error("Unknown configuration format.");
    return this.validate(JSON.parse(this.protector.unprotect(bytes.subarray(this.marker.length))));
  }
  write(value: T) {
    this.validate(value);
    try { this.check(); } catch (e) { if ((e as NodeJS.ErrnoException).code !== "ENOENT") throw e; }
    if (!this.protector.available()) throw new Error("OS protection unavailable.");
    const bytes = Buffer.concat([this.marker, this.protector.protect(JSON.stringify(value))]);
    if (bytes.length > 65536) throw new Error("Configuration too large.");
    const stage = this.path + ".writing-" + randomUUID();
    try {
      privateDirectory(dirname(this.path));
      writeFileSync(stage, bytes, { flag: "wx", mode: 0o600 });
      restrictFiles([stage]); syncFile(stage); renameSync(stage, this.path);
    } finally { if (existsSync(stage)) unlinkSync(stage); }
  }
}
