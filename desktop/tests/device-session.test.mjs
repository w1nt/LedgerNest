import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, existsSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { randomBytes } from "node:crypto";
import { DeviceSession } from "../device-session.ts";
import { Store } from "../database.ts";
import { seedExample } from "../fixtures.ts";
import { AppError } from "../errors.ts";
const schema = resolve("database/schema.sql");
const denied = () => {
  throw new AppError(409, "Verification canceled.", "AUTH_CANCELED");
};
const status = async () => ({ platform: "windows", availability: "available" });
const locked = (session) =>
  assert.throws(
    () => session.currentUser(),
    (e) => e.status === 401 && e.code === "DEVICE_LOCKED",
  );
async function fixture(action) {
  const dir = mkdtempSync(resolve(tmpdir(), "ledgernest-device-")),
    path = resolve(dir, "vault.sqlite"),
    key = randomBytes(32);
  let now = Date.now(),
    opened = 0,
    closed = 0,
    notifications = 0;
  const auth = { status, verify: async () => {} };
  const session = new DeviceSession(
    auth,
    () => {
      opened++;
      const store = new Store(path, schema, key);
      return {
        store,
        close() {
          closed++;
          store.close();
        },
      };
    },
    "example device owner",
    () => notifications++,
    () => now,
  );
  try {
    await action({
      session,
      auth,
      path,
      key,
      advance: (ms) => {
        now += ms;
      },
      counts: () => ({ opened, closed, notifications }),
    });
  } finally {
    session.lock();
    key.fill(0);
    rmSync(dir, { recursive: true, force: true, maxRetries: 3 });
  }
}
test("device verification gates even database creation; canceled authentication never opens the vault", () =>
  fixture(async ({ session, auth, path, counts }) => {
    assert.equal((await session.status()).availability, "available");
    locked(session);
    assert.equal(existsSync(path), false);
    auth.verify = denied;
    await assert.rejects(
      session.unlock("123", "en-US"),
      (e) => e.code === "AUTH_CANCELED",
    );
    assert.equal(existsSync(path), false);
    assert.equal(counts().opened, 0);
    locked(session);
    auth.verify = async () => {};
    const user = await session.unlock("123", "en-US");
    assert.equal(user.username, "example device owner");
    assert.equal("password" in user, false);
    assert.equal(session.requireService().billPage({ page: 1 }).total, 0);
    assert.equal(counts().opened, 1);
    await assert.rejects(
      seedExample(session.requireService().store),
      (e) => e.code === "PROFILE_REQUIRED",
    );
    assert.equal(
      session.requireService().store.one("SELECT count(*) n FROM users").n,
      1n,
    );
    session.lock();
    assert.equal(counts().closed, 1);
    locked(session);
    const again = await session.unlock("123", "zh-CN");
    assert.equal(again.id, user.id);
  }));
test("locking during verification rejects late success and blocks concurrent verification", () =>
  fixture(async ({ session, auth, path, counts }) => {
    let complete;
    auth.verify = () =>
      new Promise((resolve) => {
        complete = resolve;
      });
    const pending = session.unlock("123", "en-US");
    await assert.rejects(
      session.unlock("123", "en-US"),
      (e) => e.code === "AUTH_BUSY",
    );
    session.lock();
    complete();
    await assert.rejects(pending, (e) => e.code === "AUTH_CANCELED");
    assert.equal(existsSync(path), false);
    assert.equal(counts().opened, 0);
    locked(session);
    auth.verify = async () => {};
    await session.unlock("123", "en-US");
    assert.equal(counts().opened, 1);
  }));
test("device unlock adopts the sole legacy profile without changing hashes, IDs or 32 existing bills", () =>
  fixture(async ({ session, path, key }) => {
    const store = new Store(path, schema, key);
    await seedExample(store, new Date(2026, 9, 18));
    const before = store.all("SELECT id,password FROM users");
    store.close();
    const user = await session.unlock("123", "en-US");
    assert.equal(user.email, "example@example.com");
    const service = session.requireService();
    assert.equal(service.billPage({ page: 1 }).total, 32);
    assert.deepEqual(
      service.store.all("SELECT id,password FROM users"),
      before,
    );
    session.lock();
    await session.unlock("123", "en-US");
    assert.equal(session.currentUser().id, user.id);
  }));
test("legacy multi-profile vaults are rejected and closed rather than choosing or merging identities", () =>
  fixture(async ({ session, path, key, counts }) => {
    const store = new Store(path, schema, key);
    const now = "2026-10-18T00:00:00.000000000";
    for (const name of ["one", "two"])
      store.run(
        "INSERT INTO users(username,email,password,address,createdAt,updatedAt) VALUES(?,?,?,'',?,?)",
        name,
        name + "@example.com",
        "preserve-hash",
        now,
        now,
      );
    store.close();
    const before = readFileSync(path);
    await assert.rejects(
      session.unlock("123", "en-US"),
      (e) => e.code === "PROFILE_REQUIRED",
    );
    assert.equal(counts().closed, 1);
    locked(session);
    // Check logical rows: a SQLite open/checkpoint can change header metadata.
    const verify = new Store(path, schema, key);
    assert.equal(verify.one("SELECT count(*) n FROM users").n, 2n);
    assert.equal(
      verify
        .all("SELECT password FROM users")
        .every((r) => r.password === "preserve-hash"),
      true,
    );
    verify.close();
    assert.ok(before.length > 0);
  }));
test("idle, OS-idle and absolute expiry close the storage handle and require another verification", () =>
  fixture(async ({ session, advance, counts }) => {
    await session.unlock("123", "en-US");
    advance(10 * 60000);
    locked(session);
    assert.equal(counts().closed, 1);
    await session.unlock("123", "en-US");
    session.checkExpiry(600);
    locked(session);
    assert.equal(counts().closed, 2);
    await session.unlock("123", "en-US");
    for (let i = 0; i < 95; i++) {
      advance(5 * 60000);
      session.currentUser();
    }
    advance(5 * 60000);
    locked(session);
    assert.equal(counts().closed, 3);
  }));
test("production entry selects native verification and contains no fixture bypass", () => {
  const main = readFileSync("desktop/main.ts", "utf8"),
    runtime = readFileSync("desktop/runtime.ts", "utf8");
  assert.match(main, /runDesktop\(nativeAuthenticator/);
  assert.doesNotMatch(
    main + runtime,
    /LEDGERNEST_TEST_AUTH|LEDGERNEST_E2E|TEST_PROFILE|app-entry/,
  );
});
