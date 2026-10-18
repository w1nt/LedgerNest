import { test } from "node:test";
import assert from "node:assert/strict";
import { randomBytes, createCipheriv, createDecipheriv } from "node:crypto";
import {
  mkdtempSync,
  rmSync,
  readFileSync,
  writeFileSync,
  existsSync,
  unlinkSync,
  readdirSync,
  copyFileSync,
} from "node:fs";
import { resolve } from "node:path";
import { tmpdir } from "node:os";
import { DatabaseSync } from "node:sqlite";
import { Store, plaintext } from "../database.ts";
import { openVault } from "../vault.ts";
import { readKey } from "../key-store.ts";
import { seedExample } from "../fixtures.ts";
import { LocalService } from "../service.ts";
import { createBackup, restoreBackup } from "../backup.ts";
const schema = resolve("database/schema.sql");
const account = { email: "example@example.com", password: "example123" };
function protector() {
  const key = randomBytes(32);
  return {
    available: () => true,
    protect(value) {
      const iv = randomBytes(12),
        c = createCipheriv("aes-256-gcm", key, iv);
      const b = Buffer.concat([c.update(value, "utf8"), c.final()]);
      return Buffer.concat([iv, c.getAuthTag(), b]);
    },
    unprotect(value) {
      const d = createDecipheriv("aes-256-gcm", key, value.subarray(0, 12));
      d.setAuthTag(value.subarray(12, 28));
      return Buffer.concat([d.update(value.subarray(28)), d.final()]).toString(
        "utf8",
      );
    },
  };
}
async function temp(action) {
  const dir = mkdtempSync(resolve(tmpdir(), "ledgernest-encryption-"));
  try {
    await action(dir);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}
async function legacy(path) {
  const store = new Store(":memory:", schema);
  try {
    await seedExample(store, new Date(2026, 9, 18));
    writeFileSync(path, store.db.serialize(), { mode: 0o600 });
  } finally {
    store.close();
  }
}
const canonical = (db) =>
  JSON.stringify(
    db.prepare("SELECT * FROM users ORDER BY id").all(),
    (_k, v) => (typeof v === "bigint" ? String(v) : v),
  );
test("legacy migration preserves hashes/IDs/rows and encrypts database, recovery copy and live WAL", () =>
  temp(async (dir) => {
    const path = resolve(dir, "legacy.sqlite"),
      p = protector();
    await legacy(path);
    const old = new DatabaseSync(path, { readOnly: true });
    const originalStatement = old.prepare("SELECT * FROM users ORDER BY id");
    originalStatement.setReadBigInts(true);
    const before = JSON.stringify(originalStatement.all(), (_k, v) =>
      typeof v === "bigint" ? String(v) : v,
    );
    old.close();
    const vault = openVault(path, schema, p);
    try {
      assert.equal(vault.migrated, true);
      assert.equal(plaintext(path), false);
      assert.ok(existsSync(vault.recovery));
      assert.equal(canonical(vault.store.db), before);
      const s = new LocalService(vault.store);
      await s.login(account);
      assert.equal(s.billPage({ page: 1 }).total, 32);
      s.createBill({
        bill: {
          amount: "0.01",
          vendorName: "Example encrypted WAL sentinel",
          comment: "PRIVATE_WAL_SENTINEL_2026",
          dueAt: "2026-10-18T00:00:00Z",
        },
        idempotencyKey: "example_encryption_0001",
      });
      const key = readKey(path + ".key", p);
      for (const file of [
        path,
        vault.recovery,
        path + "-wal",
        path + "-shm",
        path + ".key",
      ])
        if (existsSync(file)) {
          const bytes = readFileSync(file);
          assert.ok(!bytes.includes(Buffer.from("example@example.com")));
          assert.ok(!bytes.includes(Buffer.from("PRIVATE_WAL_SENTINEL_2026")));
          assert.ok(!bytes.includes(key));
        }
      key.fill(0);
      const plain = new DatabaseSync(path, { readOnly: true });
      try {
        assert.throws(() => plain.prepare("SELECT * FROM users").all());
      } finally {
        plain.close();
      }
    } finally {
      vault.close();
    }
    const again = openVault(path, schema, p);
    try {
      assert.equal(again.migrated, false);
      const s = new LocalService(again.store);
      await s.login(account);
      assert.equal(s.billPage({ page: 1 }).total, 33);
    } finally {
      again.close();
    }
  }));
test("missing, wrong, unavailable or tampered OS keys never regenerate keys or replace a database", () =>
  temp(async (dir) => {
    const path = resolve(dir, "secure.sqlite"),
      p = protector();
    let v = openVault(path, schema, p);
    v.close();
    const data = readFileSync(path),
      key = readFileSync(path + ".key");
    unlinkSync(path + ".key");
    assert.throws(() => openVault(path, schema, p), /key is missing/);
    assert.ok(!existsSync(path + ".key"));
    assert.deepEqual(readFileSync(path), data);
    writeFileSync(path + ".key", key);
    assert.throws(() => openVault(path, schema, protector()));
    assert.deepEqual(readFileSync(path + ".key"), key);
    assert.throws(
      () => openVault(path, schema, { ...p, available: () => false }),
      /unavailable/,
    );
    const bad = Buffer.from(key);
    bad[bad.length - 1] ^= 1;
    writeFileSync(path + ".key", bad);
    assert.throws(() => openVault(path, schema, p));
    assert.deepEqual(readFileSync(path), data);
  }));
test("page tampering is rejected without reset; process lock rejects another live opener", () =>
  temp(async (dir) => {
    const path = resolve(dir, "tamper.sqlite"),
      p = protector();
    const v = openVault(path, schema, p);
    assert.throws(() => openVault(path, schema, p), /already open/);
    v.close();
    const data = readFileSync(path);
    data[data.length - 120] ^= 0x80;
    writeFileSync(path, data);
    assert.throws(() => openVault(path, schema, p));
    assert.deepEqual(readFileSync(path), data);
  }));
test("unknown legacy schema is not modified and no key is generated", () =>
  temp(async (dir) => {
    const path = resolve(dir, "foreign.sqlite");
    const d = new DatabaseSync(path);
    d.exec("CREATE TABLE other(value TEXT)");
    d.close();
    const before = readFileSync(path);
    assert.throws(() => openVault(path, schema, protector()), /Unsupported/);
    assert.deepEqual(readFileSync(path), before);
    assert.ok(!existsSync(path + ".key"));
  }));
test("portable backup restores under a different key protector; wrong passphrase and payload tampering fail closed", () =>
  temp(async (dir) => {
    const path = resolve(dir, "source.sqlite"),
      p = protector();
    await legacy(path);
    const v = openVault(path, schema, p),
      backup = resolve(dir, "example.lnbackup"),
      password = "example-backup-passphrase-2026";
    try {
      await createBackup(v.store, backup, password);
      await assert.rejects(
        createBackup(v.store, backup, password),
        /never overwritten/,
      );
    } finally {
      v.close();
    }
    assert.ok(!readFileSync(backup).includes(Buffer.from(account.email)));
    const target = resolve(dir, "restored.sqlite"),
      newProtector = protector();
    await assert.rejects(
      restoreBackup(
        backup,
        target,
        "example-wrong-passphrase",
        schema,
        newProtector,
      ),
    );
    assert.ok(!existsSync(target));
    assert.ok(!existsSync(target + ".key"));
    await restoreBackup(backup, target, password, schema, newProtector);
    const restored = openVault(target, schema, newProtector);
    try {
      const s = new LocalService(restored.store);
      await s.login(account);
      assert.equal(s.billPage({ page: 1 }).total, 32);
    } finally {
      restored.close();
    }
    await assert.rejects(
      restoreBackup(backup, target, password, schema, newProtector),
      /new database path/,
    );
    const changed = resolve(dir, "changed.lnbackup");
    copyFileSync(backup, changed);
    const bytes = readFileSync(changed);
    bytes[bytes.length - 30] ^= 1;
    writeFileSync(changed, bytes);
    const damaged = resolve(dir, "damaged.sqlite");
    await assert.rejects(
      restoreBackup(changed, damaged, password, schema, newProtector),
      /authentication/,
    );
    assert.ok(!existsSync(damaged));
    assert.ok(!existsSync(damaged + ".key"));
    assert.ok(
      !readdirSync(dir).some(
        (name) =>
          name.includes(".snapshot-") ||
          name.includes(".pending-") ||
          name.includes(".restore-"),
      ),
    );
  }));
