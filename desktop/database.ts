import Database from "better-sqlite3-multiple-ciphers";
import {
  existsSync,
  openSync,
  closeSync,
  readSync,
  readFileSync,
  lstatSync,
  fsyncSync,
} from "node:fs";
import { dirname } from "node:path";
import { privateDirectory, restrictFiles } from "./permissions.ts";
export type Row = Record<string, string | bigint | null | Uint8Array>;
export type SqlValue = string | number | bigint | null | Uint8Array;
export const tables = [
  "users",
  "bills",
  "user_preferences",
  "bill_creation_requests",
  "bill_settlements",
  "bill_payments",
  "bill_refunds",
  "bill_financial_operations",
  "bill_disputes",
  "bill_returns",
];
export function plaintext(path: string) {
  if (!existsSync(path)) return false;
  const s = lstatSync(path);
  if (!s.isFile() || s.isSymbolicLink() || s.nlink !== 1)
    throw new Error("Unsafe database file.");
  const fd = openSync(path, "r"),
    header = Buffer.alloc(16);
  try {
    return (
      readSync(fd, header, 0, 16, 0) === 16 &&
      header.equals(Buffer.from("SQLite format 3\0"))
    );
  } finally {
    closeSync(fd);
  }
}
export function syncFile(path: string) {
  const fd = openSync(path, "r+");
  try {
    fsyncSync(fd);
  } finally {
    closeSync(fd);
  }
}
export function configureCipher(db: Database.Database, key: Buffer) {
  if (!Buffer.isBuffer(key) || key.length !== 32)
    throw new Error("A 256-bit storage key is required.");
  db.pragma("cipher='sqlcipher'");
  db.pragma("legacy=0");
  db.pragma("kdf_iter=256000");
  db.pragma("hmac_use=1");
  db.pragma("hmac_check=1");
  db.pragma("kdf_algorithm=2");
  db.pragma("hmac_algorithm=2");
  db.pragma("plaintext_header_size=0");
  // Binary API keeps the key out of SQL text, traces and prepared-statement errors.
  if (db.key(key) !== 0)
    throw new Error("Unable to initialize encrypted storage.");
  if (
    db.pragma("cipher", { simple: true }) !== "sqlcipher" ||
    db.pragma("hmac_use", { simple: true }) !== "1" ||
    db.pragma("hmac_check", { simple: true }) !== "1"
  )
    throw new Error("Required cipher authentication is unavailable.");
}
export function verifySchema(
  db: Database.Database,
  schemaPath: string,
  initialize = false,
) {
  const expected = new Database(":memory:");
  try {
    expected.exec(readFileSync(schemaPath, "utf8"));
    const fingerprint = (d: Database.Database) =>
      JSON.stringify(
        d
          .prepare(
            "SELECT type,name,tbl_name,sql FROM sqlite_schema WHERE name NOT LIKE 'sqlite_%' ORDER BY type,name",
          )
          .all(),
      );
    const version = db.pragma("user_version", { simple: true });
    const empty =
      db
        .prepare(
          "SELECT name FROM sqlite_schema WHERE name NOT LIKE 'sqlite_%'",
        )
        .all().length === 0;
    if (initialize && version === 0n && empty)
      db.transaction(() =>
        db.exec(readFileSync(schemaPath, "utf8")),
      ).immediate();
    else if (version !== 1n || fingerprint(db) !== fingerprint(expected))
      throw new Error(
        "Unsupported SQLite schema; original file was not migrated or overwritten.",
      );
    if (
      (db.pragma("foreign_key_check") as unknown[]).length ||
      db.pragma("quick_check", { simple: true }) !== "ok"
    )
      throw new Error("Storage integrity check failed.");
  } finally {
    expected.close();
  }
}
export class Store {
  readonly db: Database.Database;
  readonly schemaPath: string;
  readonly path: string;
  private depth = 0;
  private savepoint = 0;
  constructor(path: string, schemaPath: string, key?: Buffer) {
    if (path !== ":memory:" && (!key || key.length !== 32))
      throw new Error("Encrypted persistent storage requires a key.");
    this.path = path;
    this.schemaPath = schemaPath;
    if (path !== ":memory:") {
      privateDirectory(dirname(path));
      if (existsSync(path)) {
        const stat = lstatSync(path);
        if (!stat.isFile() || stat.isSymbolicLink() || stat.nlink !== 1)
          throw new Error("Unsafe database file.");
      }
      if (plaintext(path))
        throw new Error(
          "Plaintext database requires the explicit secure migration path.",
        );
    }
    this.db = new Database(path, { timeout: 5000 });
    try {
      if (key) configureCipher(this.db, key);
      this.db.defaultSafeIntegers(true);
      this.db.exec(
        "PRAGMA foreign_keys=ON; PRAGMA trusted_schema=OFF; PRAGMA temp_store=MEMORY; PRAGMA secure_delete=ON; PRAGMA mmap_size=0;",
      );
      verifySchema(this.db, schemaPath, true);
      this.db.pragma("journal_mode=WAL");
      this.db.pragma("synchronous=FULL");
      // Confirm that the encrypted schema is readable after switching journal modes.
      if (this.db.pragma("user_version", { simple: true }) !== 1n)
        throw new Error("Storage version check failed.");
      this.harden();
    } catch (error) {
      this.db.close();
      throw error;
    }
  }
  all(sql: string, ...args: SqlValue[]): Row[] {
    return this.db.prepare(sql).all(...args) as Row[];
  }
  one(sql: string, ...args: SqlValue[]): Row | undefined {
    return this.all(sql, ...args)[0];
  }
  run(sql: string, ...args: SqlValue[]) {
    return this.db.prepare(sql).run(...args);
  }
  transaction<T>(action: () => T): T {
    const outer = this.depth === 0,
      name = `local_${++this.savepoint}`;
    this.db.exec(outer ? "BEGIN IMMEDIATE" : `SAVEPOINT ${name}`);
    this.depth++;
    try {
      const result = action();
      this.db.exec(outer ? "COMMIT" : `RELEASE ${name}`);
      return result;
    } catch (error) {
      if (outer) this.db.exec("ROLLBACK");
      else this.db.exec(`ROLLBACK TO ${name}; RELEASE ${name}`);
      throw error;
    } finally {
      this.depth--;
    }
  }
  harden() {
    if (this.path !== ":memory:")
      restrictFiles([this.path, this.path + "-wal", this.path + "-shm"]);
  }
  close() {
    if (!this.db.open) return;
    try {
      if (this.path !== ":memory:") this.db.pragma("wal_checkpoint(TRUNCATE)");
    } finally {
      this.db.close();
    }
  }
}
/** Copy logical rows into a database encrypted BEFORE its first page is written. No plaintext backup. */
export function copyEncrypted(
  source: Database.Database,
  path: string,
  schema: string,
  key: Buffer,
) {
  if (existsSync(path)) throw new Error("Destination already exists.");
  const target = new Store(path, schema, key);
  const normalize = (value: unknown) =>
    JSON.stringify(value, (_k, v) =>
      typeof v === "bigint" ? v.toString() : v,
    );
  try {
    source
      .transaction(() =>
        target.transaction(() => {
          for (const name of tables) {
            const columns = target.db
              .prepare(`PRAGMA table_info("${name}")`)
              .all() as { name: string }[];
            const names = columns.map((c) => `"${c.name}"`).join(",");
            const insert = target.db.prepare(
              `INSERT INTO "${name}" (${names}) VALUES (${columns.map(() => "?").join(",")})`,
            );
            for (const row of source
              .prepare(`SELECT * FROM "${name}" ORDER BY rowid`)
              .iterate() as Iterable<Row>)
              insert.run(...columns.map((c) => row[c.name]));
            if (
              normalize(
                source.prepare(`SELECT * FROM "${name}" ORDER BY rowid`).all(),
              ) !==
              normalize(
                target.db
                  .prepare(`SELECT * FROM "${name}" ORDER BY rowid`)
                  .all(),
              )
            )
              throw new Error("Migration row verification failed.");
          }
          target.db.exec("DELETE FROM sqlite_sequence");
          const seq = target.db.prepare(
            "INSERT INTO sqlite_sequence(name,seq) VALUES(?,?)",
          );
          for (const row of source
            .prepare("SELECT name,seq FROM sqlite_sequence")
            .all() as { name: string; seq: bigint }[])
            seq.run(row.name, row.seq);
        }),
      )
      .immediate();
    verifySchema(target.db, schema);
  } finally {
    target.close();
  }
  syncFile(path);
}
