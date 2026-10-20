import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync } from "node:fs";
import { randomBytes, createCipheriv, createDecipheriv } from "node:crypto";
import { resolve } from "node:path";
import { tmpdir } from "node:os";
import { DataLocation } from "../data-location.ts";
import { DataTools } from "../data-tools.ts";
import { DeviceSession } from "../device-session.ts";
import { openVault } from "../vault.ts";
import { seedExample } from "../fixtures.ts";
const schema = resolve("database/schema.sql"), password = "example-backup-passphrase";
function protector() {
  const key = randomBytes(32);
  return { available: () => true, protect(value) {
    const iv = randomBytes(12), cipher = createCipheriv("aes-256-gcm", key, iv);
    const ciphertext = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
    return Buffer.concat([iv, cipher.getAuthTag(), ciphertext]);
  }, unprotect(value) {
    const cipher = createDecipheriv("aes-256-gcm", key, value.subarray(0, 12));
    cipher.setAuthTag(value.subarray(12, 28));
    return Buffer.concat([cipher.update(value.subarray(28)), cipher.final()]).toString("utf8");
  } };
}
async function fixture(action) {
  const dir = mkdtempSync(resolve(tmpdir(), "ledgernest-data-tools-")), original = resolve(dir, "example.sqlite"), p = protector();
  const initial = openVault(original, schema, p);
  await seedExample(initial.store, new Date(2026, 9, 18)); initial.close();
  const location = new DataLocation(original, p);
  let tools;
  const auth = { status: async () => ({ platform: "windows", availability: "available" }), verify: async () => {} };
  const device = new DeviceSession(auth, () => openVault(location.activePath(), schema, p), "Example", () => tools?.cancel());
  const choice = { directory: undefined, save: undefined, open: undefined, confirm: true, verify: true, onSave: undefined };
  const dialogs = { directory: async () => choice.directory, save: async () => { if (choice.onSave) await choice.onSave(); return choice.save; }, open: async () => choice.open, confirmRestore: async () => choice.confirm };
  tools = new DataTools(location, device, schema, p, dialogs, async () => { if (!choice.verify) throw new Error("Verification denied"); });
  try { await action({ dir, original, p, device, tools, location, choice }); }
  finally { device.lock(); rmSync(dir, { recursive: true, force: true }); }
}
const restoreInput = { password, locale: "en-US" };
test("exports every page with exact amounts, localized CSV, formula-safe cells and a public field allowlist", () => fixture(async ({ dir, device, tools, choice }) => {
  assert.throws(() => tools.export({ format: "json", plaintextConfirmed: true, locale: "en-US" }), e => e.status === 401);
  await device.unlock("0", "en-US");
  const service = device.requireService();
  for (let i = 0; i < 73; i++) service.createBill({ bill: { amount: i ? "0.01" : "999999999.99", vendorName: i ? "Example export " + i : ' =HYPERLINK("https://example.invalid")', comment: '中文,"quoted"\nsecond line', dueAt: "2026-10-20T00:00:00Z" }, idempotencyKey: "example_export_" + String(i).padStart(10, "0") });
  choice.save = resolve(dir, "records.json");
  assert.throws(() => tools.export({ format: "json", plaintextConfirmed: false, locale: "en-US" }), e => e.code === "DATA_PLAINTEXT");
  const result = await tools.export({ format: "json", plaintextConfirmed: true, locale: "en-US" });
  assert.equal(result.records, 105);
  const text = readFileSync(choice.save, "utf8"), parsed = JSON.parse(text);
  assert.equal(parsed.records.length, 105);
  const row = parsed.records.find(row => row.amount === "999999999.99");
  assert.equal(row.vendorName, '=HYPERLINK("https://example.invalid")');
  assert.equal(row.comment, '中文,"quoted"\nsecond line');
  assert.deepEqual(Object.keys(row), ["id", "vendorName", "amount", "currency", "comment", "dueAt", "createdAt", "settlementStatus", "settlementVersion", "confirmedAmount", "processingAmount", "remainingAmount", "overpaidAmount"]);
  for (const secret of ["example@example.com", "example123", '"password"', '"apiKey"', '"address"', '"userId"']) assert.equal(text.includes(secret), false);
  await assert.rejects(tools.export({ format: "json", plaintextConfirmed: true, locale: "en-US" }), e => e.code === "DATA_EXISTS");
  assert.equal(readFileSync(choice.save, "utf8"), text);
  choice.save = resolve(dir, "records-zh.csv");
  await tools.export({ format: "csv", plaintextConfirmed: true, locale: "zh-CN" });
  const csv = readFileSync(choice.save, "utf8");
  assert.ok(csv.startsWith("\ufeff记录编号,收款方,金额,币种,备注,"));
  assert.ok(csv.includes('"\'=HYPERLINK(""https://example.invalid"")"'));
  assert.ok(csv.includes('"中文,""quoted""\nsecond line"'));
  assert.ok(csv.includes('"待支付"'));
  choice.save = resolve(dir, "records-en.csv");
  await tools.export({ format: "csv", plaintextConfirmed: true, locale: "en-US" });
  assert.ok(readFileSync(choice.save, "utf8").startsWith("\ufeffid,vendorName,amount,currency,comment,"));
}));
test("backup directory persists encrypted; canceled dialogs and locking never publish a file", () => fixture(async ({ dir, original, p, device, tools, location, choice }) => {
  await device.unlock("0", "en-US");
  const cloud = resolve(dir, "example-sync-folder"); mkdirSync(cloud);
  choice.directory = cloud;
  assert.equal((await tools.chooseDirectory()).directory, cloud);
  assert.equal(new DataLocation(original, p).get().directory, cloud);
  assert.equal(readFileSync(location.path).includes(Buffer.from(cloud)), false);
  assert.equal(await tools.backup({ password, confirmation: password }), null);
  choice.save = resolve(cloud, "example.lnbackup");
  choice.onSave = async () => device.lock();
  await assert.rejects(tools.backup({ password, confirmation: password }), e => e.code === "DATA_CANCELED");
  assert.equal(existsSync(choice.save), false);
  await device.unlock("0", "en-US"); choice.onSave = undefined;
  assert.throws(() => tools.backup({ password, confirmation: "not-the-same-passphrase" }), e => e.code === "DATA_PASSWORD_MATCH");
}));
test("restore validates before switching, preserves old DB/key, survives restart and restores with old key missing", () => fixture(async ({ dir, original, p, device, tools, location, choice }) => {
  await device.unlock("0", "en-US");
  choice.save = resolve(dir, "portable.lnbackup");
  assert.equal((await tools.backup({ password, confirmation: password })).records, 32);
  assert.equal(readFileSync(choice.save).includes(Buffer.from("example@example.com")), false);
  device.requireService().createBill({ bill: { amount: "1.23", vendorName: "Example after backup", comment: "", dueAt: "2026-10-20T00:00:00Z" }, idempotencyKey: "example_after_backup_0001" });
  device.lock();
  const beforeDb = readFileSync(original), beforeKey = readFileSync(original + ".key");
  choice.open = choice.save;
  await assert.rejects(tools.restore({ ...restoreInput, password: "example-wrong-passphrase" }), e => e.code === "DATA_RESTORE");
  assert.equal(location.activePath(), original);
  assert.equal(existsSync(original + ".restores") ? readdirSync(original + ".restores").length : 0, 0);
  choice.verify = false;
  await assert.rejects(tools.restore(restoreInput), /Verification denied/u);
  assert.equal(location.activePath(), original);
  choice.verify = true;
  choice.confirm = false;
  assert.equal(await tools.restore(restoreInput), null);
  assert.equal(location.activePath(), original);
  choice.confirm = true;
  const protect = p.protect;
  p.protect = value => { if (value.startsWith('{"version":1,')) throw new Error("Simulated selector write failure"); return protect(value); };
  await assert.rejects(tools.restore(restoreInput), e => e.code === "DATA_CONFIG");
  assert.equal(location.activePath(), original);
  assert.deepEqual(readFileSync(original), beforeDb); assert.deepEqual(readFileSync(original + ".key"), beforeKey);
  assert.equal(readdirSync(original + ".restores").length, 0);
  p.protect = protect;
  assert.equal((await tools.restore(restoreInput)).records, 32);
  const active = location.activePath(); assert.notEqual(active, original);
  assert.deepEqual(readFileSync(original), beforeDb); assert.deepEqual(readFileSync(original + ".key"), beforeKey);
  assert.equal(new DataLocation(original, p).activePath(), active);
  await device.unlock("0", "en-US"); assert.equal(device.requireService().billPage({ page: 1 }).total, 32); device.lock();
  // Recovery is available without opening the current database or possessing its old key.
  rmSync(active + ".key");
  await tools.restore(restoreInput);
  await device.unlock("0", "en-US"); assert.equal(device.requireService().billPage({ page: 1 }).total, 32);
  device.lock();
  // Corrupt selectors fail closed instead of falling back to an empty/original DB.
  writeFileSync(location.path, "corrupt");
  assert.throws(() => location.activePath(), e => e.code === "DATA_CONFIG");
}));
