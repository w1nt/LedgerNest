import { randomBytes } from "node:crypto";
import {
  existsSync,
  lstatSync,
  readFileSync,
  openSync,
  closeSync,
  writeFileSync,
  fsyncSync,
} from "node:fs";
import { dirname } from "node:path";
import { privateDirectory, restrictFiles } from "./permissions.ts";
export interface KeyProtector {
  available(): boolean;
  protect(value: string): Buffer;
  unprotect(value: Buffer): string;
}
const prefix = "LedgerNest database key v1:";
export function readKey(path: string, protector: KeyProtector) {
  if (!protector.available())
    throw new Error("Secure operating-system key storage is unavailable.");
  const stat = lstatSync(path);
  if (
    !stat.isFile() ||
    stat.isSymbolicLink() ||
    stat.nlink !== 1 ||
    stat.size > 16384
  )
    throw new Error("Invalid protected key file.");
  const encoded = protector.unprotect(readFileSync(path));
  if (
    !encoded.startsWith(prefix) ||
    !/^[A-Za-z0-9+/]{43}=$/u.test(encoded.slice(prefix.length))
  )
    throw new Error("Invalid protected key.");
  restrictFiles([path]);
  return Buffer.from(encoded.slice(prefix.length), "base64");
}
export function writeKey(path: string, key: Buffer, protector: KeyProtector) {
  if (!protector.available() || key.length !== 32)
    throw new Error("Secure operating-system key storage is unavailable.");
  privateDirectory(dirname(path));
  const payload = protector.protect(prefix + key.toString("base64"));
  const fd = openSync(path, "wx", 0o600);
  try {
    writeFileSync(fd, payload);
    fsyncSync(fd);
  } finally {
    closeSync(fd);
  }
  restrictFiles([path]);
  const roundTrip = readKey(path, protector);
  try {
    if (!roundTrip.equals(key))
      throw new Error("Protected key verification failed.");
  } finally {
    roundTrip.fill(0);
  }
}
export function obtainKey(
  dbPath: string,
  protector: KeyProtector,
  mayCreate: boolean,
) {
  if (!protector.available())
    throw new Error("Secure operating-system key storage is unavailable.");
  const file = dbPath + ".key";
  if (existsSync(file)) return readKey(file, protector);
  if (!mayCreate)
    throw new Error(
      "Database encryption key is missing. Restore from an encrypted backup; no replacement key was generated.",
    );
  const key = randomBytes(32);
  try {
    writeKey(file, key, protector);
    return key;
  } catch (error) {
    key.fill(0);
    throw error;
  }
}
