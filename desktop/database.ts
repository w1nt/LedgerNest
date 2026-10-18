import { DatabaseSync } from "node:sqlite";
import { mkdirSync, readFileSync } from "node:fs";
import { dirname } from "node:path";
import type { SQLInputValue } from "node:sqlite";
export type Row = Record<string, string | bigint | null | Uint8Array>;
export class Store {
  readonly db: DatabaseSync;
  private depth = 0;
  private savepoint = 0;
  constructor(path: string, schemaPath: string) {
    if (path !== ":memory:") mkdirSync(dirname(path), { recursive: true });
    this.db = new DatabaseSync(path, {
      enableForeignKeyConstraints: true,
      enableDoubleQuotedStringLiterals: false,
      allowExtension: false,
    });
    try {
      this.db.exec("PRAGMA busy_timeout=5000; PRAGMA trusted_schema=OFF;");
      const expected = new DatabaseSync(":memory:");
      try {
        expected.exec(readFileSync(schemaPath, "utf8"));
        const fingerprint = (db: DatabaseSync) =>
          JSON.stringify(
            db
              .prepare(
                "SELECT type,name,tbl_name,sql FROM sqlite_schema WHERE name NOT LIKE 'sqlite_%' ORDER BY type,name",
              )
              .all(),
          );
        const version = this.one("PRAGMA user_version")!.user_version;
        const tables = this.all(
          "SELECT name FROM sqlite_schema WHERE name NOT LIKE 'sqlite_%'",
        );
        if (version === 0n && tables.length === 0) {
          this.transaction(() =>
            this.db.exec(readFileSync(schemaPath, "utf8")),
          );
        } else if (
          version !== 1n ||
          fingerprint(this.db) !== fingerprint(expected)
        ) {
          throw new Error(
            "Unsupported SQLite schema; original file was not migrated or overwritten.",
          );
        }
      } finally {
        expected.close();
      }
      if (
        this.all("PRAGMA foreign_key_check").length ||
        this.one("PRAGMA quick_check")?.quick_check !== "ok"
      )
        throw new Error("SQLite integrity check failed.");
      this.db.exec("PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL;");
    } catch (error) {
      this.db.close();
      throw error;
    }
  }
  all(sql: string, ...args: SQLInputValue[]): Row[] {
    const s = this.db.prepare(sql);
    s.setReadBigInts(true);
    return s.all(...args) as Row[];
  }
  one(sql: string, ...args: SQLInputValue[]): Row | undefined {
    return this.all(sql, ...args)[0];
  }
  run(sql: string, ...args: SQLInputValue[]) {
    return this.db.prepare(sql).run(...args);
  }
  transaction<T>(action: () => T): T {
    const outer = this.depth === 0;
    const name = `local_${++this.savepoint}`;
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
  close() {
    this.db.close();
  }
}
