import {
  randomBytes,
  randomUUID,
  scrypt,
  createCipheriv,
  createDecipheriv,
  createHash,
  timingSafeEqual,
} from "node:crypto";
import {
  existsSync,
  openSync,
  closeSync,
  readSync,
  writeSync,
  fsyncSync,
  unlinkSync,
  linkSync,
  statSync,
} from "node:fs";
import { dirname } from "node:path";
import { Store, copyEncrypted, syncFile } from "./database.ts";
import { writeKey, type KeyProtector } from "./key-store.ts";
import { privateDirectory, restrictFiles } from "./permissions.ts";
const magic = Buffer.from("LNBACK01"),
  headerLength = 116,
  maxSize = 512 * 1024 * 1024;
async function passwordKey(password: string, salt: Buffer) {
  if (
    typeof password !== "string" ||
    password.length < 12 ||
    password.length > 256
  )
    throw new Error("Backup passphrase must contain 12 to 256 characters.");
  return await new Promise<Buffer>((resolve, reject) =>
    scrypt(
      password,
      salt,
      32,
      { N: 131072, r: 8, p: 1, maxmem: 256 * 1024 * 1024 },
      (error, key) => (error ? reject(error) : resolve(key)),
    ),
  );
}
function remove(path: string) {
  try {
    unlinkSync(path);
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code !== "ENOENT") throw e;
  }
}
/** Publish without replacing an existing target, including a racing competing writer. */
function publish(stage: string, target: string) {
  linkSync(stage, target);
  unlinkSync(stage);
  syncFile(target);
}
function copyPayload(input: string, outputFd: number, start = 0) {
  const fd = openSync(input, "r"),
    buffer = Buffer.alloc(128 * 1024),
    hash = createHash("sha256");
  try {
    let position = start;
    for (;;) {
      const n = readSync(fd, buffer, 0, buffer.length, position);
      if (!n) break;
      position += n;
      hash.update(buffer.subarray(0, n));
      let written = 0;
      while (written < n)
        written += writeSync(outputFd, buffer, written, n - written);
    }
  } finally {
    closeSync(fd);
    buffer.fill(0);
  }
  return hash.digest();
}
function digestFile(file: string, start = 0) {
  const fd = openSync(file, "r"),
    buffer = Buffer.alloc(128 * 1024),
    hash = createHash("sha256");
  try {
    let pos = start;
    for (;;) {
      const n = readSync(fd, buffer, 0, buffer.length, pos);
      if (!n) break;
      pos += n;
      hash.update(buffer.subarray(0, n));
    }
    return hash.digest();
  } finally {
    closeSync(fd);
    buffer.fill(0);
  }
}
export async function createBackup(
  store: Store,
  target: string,
  password: string,
) {
  if (!target.endsWith(".lnbackup") || existsSync(target))
    throw new Error(
      "Choose a new .lnbackup file; existing files are never overwritten.",
    );
  privateDirectory(dirname(target));
  const salt = randomBytes(16),
    iv = randomBytes(12),
    key = await passwordKey(password, salt),
    dataKey = randomBytes(32);
  const snapshot = target + ".snapshot-" + randomUUID() + ".sqlite",
    stage = target + ".pending-" + randomUUID();
  try {
    copyEncrypted(store.db, snapshot, store.schemaPath, dataKey);
    if (statSync(snapshot).size > maxSize)
      throw new Error("Backup exceeds the supported 512 MiB limit.");
    const material = Buffer.concat([dataKey, digestFile(snapshot)]);
    const cipher = createCipheriv("aes-256-gcm", key, iv),
      aad = Buffer.concat([magic, salt, iv]);
    cipher.setAAD(aad);
    const protectedKey = Buffer.concat([
      cipher.update(material),
      cipher.final(),
    ]);
    material.fill(0);
    const header = Buffer.concat([aad, cipher.getAuthTag(), protectedKey]);
    const fd = openSync(stage, "wx", 0o600);
    try {
      writeSync(fd, header);
      copyPayload(snapshot, fd);
      fsyncSync(fd);
    } finally {
      closeSync(fd);
    }
    restrictFiles([stage]);
    publish(stage, target);
  } finally {
    key.fill(0);
    dataKey.fill(0);
    remove(snapshot);
    remove(stage);
  }
}
export async function restoreBackup(
  backup: string,
  target: string,
  password: string,
  schema: string,
  protector: KeyProtector,
) {
  if (
    existsSync(target) ||
    existsSync(target + ".key") ||
    existsSync(target + ".lock") ||
    existsSync(target + "-wal") ||
    existsSync(target + "-shm")
  )
    throw new Error("Restore requires a new database path.");
  const size = statSync(backup).size;
  if (
    size < headerLength + 4096 ||
    size > headerLength + maxSize ||
    (size - headerLength) % 4096 !== 0
  )
    throw new Error("Invalid encrypted backup.");
  const header = Buffer.alloc(headerLength),
    fd = openSync(backup, "r");
  try {
    if (readSync(fd, header, 0, headerLength, 0) !== headerLength)
      throw new Error("Invalid backup.");
  } finally {
    closeSync(fd);
  }
  if (!header.subarray(0, 8).equals(magic))
    throw new Error("Unsupported backup format.");
  const key = await passwordKey(password, header.subarray(8, 24));
  let material: Buffer | undefined;
  const stage = target + ".restore-" + randomUUID() + ".sqlite";
  try {
    const decipher = createDecipheriv(
      "aes-256-gcm",
      key,
      header.subarray(24, 36),
    );
    decipher.setAAD(header.subarray(0, 36));
    decipher.setAuthTag(header.subarray(36, 52));
    material = Buffer.concat([
      decipher.update(header.subarray(52)),
      decipher.final(),
    ]);
    privateDirectory(dirname(target));
    const out = openSync(stage, "wx", 0o600);
    let digest: Buffer;
    try {
      digest = copyPayload(backup, out, headerLength);
      fsyncSync(out);
    } finally {
      closeSync(out);
    }
    if (!timingSafeEqual(digest!, material.subarray(32)))
      throw new Error("Encrypted backup authentication failed.");
    const store = new Store(stage, schema, material.subarray(0, 32));
    store.close();
    writeKey(target + ".key", material.subarray(0, 32), protector);
    restrictFiles([stage]);
    publish(stage, target);
  } finally {
    key.fill(0);
    material?.fill(0);
    remove(stage);
  }
}
