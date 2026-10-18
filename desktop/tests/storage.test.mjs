import { randomBytes } from "node:crypto";
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { Store } from "../database.ts";
import { LocalService } from "../service.ts";
import { seedExample } from "../fixtures.ts";
import { AppError, reply } from "../errors.ts";
import { trustedURL } from "../boundary.ts";
import { timestamp } from "../validation.ts";
const schema = resolve("database/schema.sql");
const registration = {
  username: "example",
  email: "example@example.com",
  password: "example123",
  confirm: "example123",
  address: "",
};
const login = { email: registration.email, password: registration.password };
const input = {
  amount: "12.34",
  vendorName: "Example",
  comment: "",
  dueAt: "2026-10-18T00:00:00Z",
};
const key = "example_request_0001";
const fails = (fn, status) =>
  assert.throws(
    fn,
    (error) => error instanceof AppError && error.status === status,
  );
async function fixture(fn) {
  const dir = mkdtempSync(resolve(tmpdir(), "ledgernest-unit-"));
  const path = resolve(dir, "test.sqlite");
  const storageKey = randomBytes(32);
  let store = new Store(path, schema, storageKey);
  try {
    await fn({
      store,
      path,
      reopen() {
        store.close();
        store = new Store(path, schema, storageKey);
        return store;
      },
    });
  } finally {
    store.close();
    rmSync(dir, { recursive: true, force: true });
  }
}
test("schema matches legacy reference and unknown databases are not initialized", async () => {
  assert.equal(
    readFileSync(schema, "utf8"),
    readFileSync(
      "backend/SpringBoot_demo/src/main/resources/schema.sql",
      "utf8",
    ),
  );
  const dir = mkdtempSync(resolve(tmpdir(), "ledgernest-foreign-")),
    path = resolve(dir, "foreign.sqlite");
  const db = new DatabaseSync(path);
  db.exec(
    "CREATE TABLE private_data (value TEXT); INSERT INTO private_data VALUES('preserve');",
  );
  db.close();
  const before = readFileSync(path);
  assert.throws(() => new Store(path, schema, randomBytes(32)), /Plaintext/);
  assert.deepEqual(readFileSync(path), before);
  rmSync(dir, { recursive: true, force: true });
});
test("registration, Java-compatible hashes, login, expiry, credential invalidation and logout race", () =>
  fixture(async ({ store }) => {
    let time = Date.now();
    const service = new LocalService(store, () => time);
    fails(() => service.currentUser(), 401);
    const user = await service.register(registration);
    assert.equal(user.email, login.email);
    assert.ok(!("password" in user));
    assert.match(
      store.one("SELECT password FROM users").password,
      /^pbkdf2\$600000\$/,
    );
    await assert.rejects(
      service.login({ ...login, password: "wrong" }),
      (e) => e.status === 401,
    );
    assert.deepEqual(await service.login(login), user);
    time += 31 * 60000;
    fails(() => service.currentUser(), 401);
    await service.login(login);
    store.run("UPDATE users SET password='changed' WHERE id=?", user.id);
    fails(() => service.currentUser(), 401);
    const hash = (await import("../passwords.ts")).hashPassword;
    store.run(
      "UPDATE users SET password=? WHERE id=?",
      await hash(login.password),
      user.id,
    );
    const pending = service.login(login);
    service.logout();
    await assert.rejects(pending, (e) => e.status === 401);
    fails(() => service.currentUser(), 401);
  }));
test("integer cents, UTC nanoseconds, idempotency, ownership, rollback and persistence", () =>
  fixture(async ({ store, reopen }) => {
    const service = new LocalService(store);
    const user = await service.register(registration);
    await service.login(login);
    const saved = service.createBill({
      bill: {
        ...input,
        vendorName: "Example'); DROP TABLE users;--",
        dueAt: "2026-10-18T01:02:03.123456789+01:00",
      },
      idempotencyKey: key,
    });
    assert.equal(saved.amount, "12.34");
    assert.equal(saved.dueAt, "2026-10-18T00:02:03.123456789Z");
    assert.equal(store.one("SELECT amountCents FROM bills").amountCents, 1234n);
    assert.deepEqual(
      service.createBill({
        bill: { ...input, vendorName: saved.vendorName, dueAt: saved.dueAt },
        idempotencyKey: key,
      }),
      saved,
    );
    fails(() => service.createBill({ bill: input, idempotencyKey: key }), 409);
    const other = new LocalService(store);
    await other.register({ ...registration, email: "other@example.com" });
    await other.login({ ...login, email: "other@example.com" });
    assert.equal(other.billPage({ page: 1 }).total, 0);
    fails(
      () =>
        other.createBill({
          bill: { ...input, userId: user.id },
          idempotencyKey: "example_other_0001",
        }),
      400,
    );
    const count = store.one("SELECT count(*) n FROM bills").n;
    store.db.exec(
      "CREATE TEMP TRIGGER test_rollback BEFORE INSERT ON bill_settlements BEGIN SELECT RAISE(ABORT,'test'); END",
    );
    assert.throws(() =>
      service.createBill({
        bill: input,
        idempotencyKey: "example_rollback_0001",
      }),
    );
    assert.equal(store.one("SELECT count(*) n FROM bills").n, count);
    store.db.exec("DROP TRIGGER test_rollback");
    assert.equal(store.all("PRAGMA foreign_key_check").length, 0);
    const again = new LocalService(reopen());
    await again.login(login);
    assert.equal(again.billPage({ page: 1 }).items[0].id, saved.id);
  }));
test("malformed IPC payloads, anonymous access and internal failures fail closed", () =>
  fixture(async ({ store }) => {
    const s = new LocalService(store);
    fails(() => s.createBill({ bill: input, idempotencyKey: key }), 401);
    await s.register(registration);
    await s.login(login);
    for (const amount of ["0", "1e3", "0.001", "1000000000", "-1", 12.34])
      fails(
        () => s.createBill({ bill: { ...input, amount }, idempotencyKey: key }),
        400,
      );
    for (const dueAt of [
      "2026-02-30T00:00:00Z",
      "2026-01-01T24:00:00Z",
      "2026-01-01T00:00:00+19:00",
      "2026-01-01",
    ])
      fails(
        () => s.createBill({ bill: { ...input, dueAt }, idempotencyKey: key }),
        400,
      );
    fails(() => s.billPage({ page: 1, userId: 1 }), 400);
    fails(() => s.billPage({ page: 1.5 }), 400);
    const response = await reply(() => {
      throw new Error("password SQL C:/secret.sqlite");
    });
    assert.equal(response.error.status, 503);
    assert.ok(!JSON.stringify(response).includes("secret"));
    assert.equal(
      timestamp("2026-10-18T00:00:00Z"),
      "2026-10-18T00:00:00.000000000",
    );
  }));
test("synthetic account keeps 32 bills and October summary; repeated seeding is read-only for existing fixtures", () =>
  fixture(async ({ store }) => {
    const date = new Date(2026, 9, 18);
    assert.deepEqual(await seedExample(store, date), {
      created: 32,
      skipped: 0,
      billCount: 32,
    });
    const before = JSON.stringify(store.all("SELECT * FROM bills"), (_, v) =>
      typeof v === "bigint" ? String(v) : v,
    );
    assert.deepEqual(await seedExample(store, date), {
      created: 0,
      skipped: 32,
      billCount: 32,
    });
    assert.equal(
      JSON.stringify(store.all("SELECT * FROM bills"), (_, v) =>
        typeof v === "bigint" ? String(v) : v,
      ),
      before,
    );
    const s = new LocalService(store);
    await s.login(login);
    const rows = s
      .billPage({ page: 1 })
      .items.filter((b) => b.dueAt.startsWith("2026-10"));
    const sum = (field) =>
      rows.reduce((n, b) => n + BigInt(b[field].replace(".", "")), 0n);
    assert.equal(sum("amount"), 173462n);
    assert.equal(sum("confirmedAmount"), 140223n);
    assert.equal(sum("remainingAmount"), 33239n);
  }));
test("origin guard rejects deceptive and external URLs", () => {
  for (const url of ["ledgernest://app/", "ledgernest://app/home/bills"])
    assert.equal(trustedURL(url), true);
  for (const url of [
    "file:///tmp/app",
    "https://app/",
    "ledgernest://evil/",
    "ledgernest://app.evil/",
    "ledgernest://user@app/",
    "ledgernest://app:42/",
    "javascript:alert(1)",
  ])
    assert.equal(trustedURL(url), false);
});
