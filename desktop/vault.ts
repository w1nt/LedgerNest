import Database from "better-sqlite3-multiple-ciphers";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
  unlinkSync,
  rmdirSync,
  renameSync,
  copyFileSync,
  constants,
  lstatSync,
} from "node:fs";
import { randomUUID } from "node:crypto";
import { dirname } from "node:path";
import {
  Store,
  copyEncrypted,
  plaintext,
  verifySchema,
  syncFile,
} from "./database.ts";
import { obtainKey, type KeyProtector } from "./key-store.ts";
import { privateDirectory, restrictFiles } from "./permissions.ts";
function acquire(path: string) {
  const lock = path + ".lock",
    owner = lock + "/owner.json",
    nonce = randomUUID();
  try {
    mkdirSync(lock, { mode: 0o700 });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
    if (lstatSync(lock).isSymbolicLink())
      throw new Error("Unsafe database lock.");
    const stat = lstatSync(owner);
    if (!stat.isFile() || stat.isSymbolicLink() || stat.size > 1024)
      throw new Error("Invalid database lock.");
    const pid = JSON.parse(readFileSync(owner, "utf8")).pid;
    if (!Number.isSafeInteger(pid) || pid < 1)
      throw new Error("Invalid database lock.");
    try {
      process.kill(pid, 0);
      throw new Error("Database is already open in another process.");
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code !== "ESRCH") throw e;
    }
    unlinkSync(owner);
    rmdirSync(lock);
    mkdirSync(lock, { mode: 0o700 });
  }
  writeFileSync(owner, JSON.stringify({ pid: process.pid, nonce }), {
    flag: "wx",
    mode: 0o600,
  });
  return () => {
    if (JSON.parse(readFileSync(owner, "utf8")).nonce !== nonce)
      throw new Error("Database lock ownership changed.");
    unlinkSync(owner);
    rmdirSync(lock);
  };
}
export function openVault(
  path: string,
  schema: string,
  protector: KeyProtector,
) {
  privateDirectory(dirname(path));
  const release = acquire(path);
  let key: Buffer | undefined;
  try {
    const isPlain = plaintext(path);
    // Validate legacy files before generating any key or changing their journal mode.
    if (isPlain) {
      const probe = new Database(path, { readonly: true, fileMustExist: true });
      try {
        probe.defaultSafeIntegers(true);
        verifySchema(probe, schema);
      } finally {
        probe.close();
      }
    }
    key = obtainKey(path, protector, !existsSync(path) || isPlain);
    let recovery: string | undefined;
    if (isPlain) {
      restrictFiles([path, path + "-wal", path + "-shm"]);
      const stage = path + ".encrypting-" + randomUUID() + ".sqlite";
      const source = new Database(path, { fileMustExist: true });
      try {
        source.defaultSafeIntegers(true);
        source.pragma("trusted_schema=OFF");
        source.pragma("temp_store=MEMORY");
        if (source.pragma("journal_mode=DELETE", { simple: true }) !== "delete")
          throw new Error("Close other programs before migrating storage.");
        // EXCLUSIVE lock in rollback mode rejects external readers/writers during the snapshot.
        source
          .transaction(() => copyEncrypted(source, stage, schema, key!))
          .exclusive();
      } finally {
        source.close();
      }
      recovery = path + ".migration-" + randomUUID() + ".sqlite";
      copyFileSync(stage, recovery, constants.COPYFILE_EXCL);
      restrictFiles([recovery]);
      syncFile(recovery);
      renameSync(stage, path);
      syncFile(path);
      restrictFiles([path]);
    }
    const store = new Store(path, schema, key);
    key.fill(0);
    key = undefined;
    let closed = false;
    return {
      store,
      migrated: isPlain,
      recovery,
      close() {
        if (closed) return;
        closed = true;
        try {
          store.close();
        } finally {
          release();
        }
      },
    };
  } catch (error) {
    key?.fill(0);
    release();
    throw error;
  }
}
