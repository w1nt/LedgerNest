import assert from "node:assert/strict";
import { _electron as electron } from "playwright";
import { mkdtemp, rm, readFile, writeFile, mkdir, readdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { Store } from "../database.ts";
import { seedExample } from "../fixtures.ts";
const dir = await mkdtemp(resolve(tmpdir(), "ledgernest-data-ui-")), db = resolve(dir, "example.sqlite"), cloud = resolve(dir, "example-cloud-directory"), backup = resolve(cloud, "example.lnbackup");
await mkdir(cloud);
const seed = new Store(":memory:", resolve("database/schema.sql"));
await seedExample(seed, new Date(2026, 9, 18)); await writeFile(db, seed.db.serialize()); seed.close();
const env = { ...process.env, LEDGERNEST_DB_PATH: db, LEDGERNEST_TEST_PROFILE: resolve(dir, "profile") };
delete env.ELECTRON_RUN_AS_NODE; delete env.LEDGERNEST_TEST_AUTH_FIRST_CANCEL;
const errors = [], requests = [], password = "example-portable-passphrase";
let app;
async function launch() {
  app = await electron.launch({ args: [resolve(".local-tools/device-auth-tests/main.cjs")], cwd: process.cwd(), env });
  await app.evaluate(({ dialog }, { cloud, backup }) => {
    globalThis.dataChoices = { directory: cloud, save: undefined, open: backup, confirm: true, hold: false };
    dialog.showSaveDialog = async () => {
      if (globalThis.dataChoices.hold) await new Promise(resolve => { globalThis.releaseSave = resolve; });
      const path = globalThis.dataChoices.save;
      return { canceled: !path, filePath: path };
    };
    dialog.showOpenDialog = async (_win, options) => {
      const path = options.properties.includes("openDirectory") ? globalThis.dataChoices.directory : globalThis.dataChoices.open;
      return { canceled: !path, filePaths: path ? [path] : [] };
    };
    dialog.showMessageBox = async () => ({ response: globalThis.dataChoices.confirm ? 1 : 0 });
  }, { cloud, backup });
  const page = await app.firstWindow(); page.setDefaultTimeout(15000);
  await page.emulateMedia({ reducedMotion: "reduce" });
  page.on("pageerror", e => errors.push(e.message));
  page.on("request", r => { if (/^https?:/u.test(r.url())) requests.push(r.url()); });
  await page.waitForFunction(() => !!window.ledgernest);
  return page;
}
async function choices(value) { await app.evaluate((_electron, value) => Object.assign(globalThis.dataChoices, value), value); }
async function unlock(page) { await page.getByTestId("device-unlock").click(); await page.waitForURL(u => u.pathname.startsWith("/home/")); }
async function dataPage(page) { await page.goto("ledgernest://app/home/settings"); await page.locator("#setting-tab-data").click(); }
async function action(page, name, pass = password) {
  await page.getByRole("button", { name, exact: true }).click();
  const modal = page.getByRole("dialog");
  await modal.locator('input[name="backup-passphrase"]').fill(pass);
  if (await modal.locator('input[name="backup-repeat"]').count()) await modal.locator('input[name="backup-repeat"]').fill(pass);
  await modal.getByRole("button", { name: "Continue to file selection", exact: true }).click();
}
async function exportFile(page, path, format = "CSV", button = "Export plaintext records", submit = "Continue to file selection") {
  await choices({ save: path });
  await page.getByRole("button", { name: button, exact: true }).click();
  const modal = page.getByRole("dialog");
  assert.equal(await modal.getByRole("button", { name: submit, exact: true }).isDisabled(), true);
  if (format === "JSON") { await modal.getByRole("combobox").click(); await page.getByRole("option", { name: "JSON", exact: true }).click(); }
  await modal.getByRole("checkbox").check();
  await modal.getByRole("button", { name: submit, exact: true }).click();
  await modal.waitFor({ state: "detached" });
}
try {
  console.log("data UI: launch");
  let page = await launch();
  await page.evaluate(() => localStorage.setItem("billing-language", "en-US")); await page.reload();
  for (const [method, value] of [["backupLocation"], ["chooseBackupDirectory"], ["backupData", { password, confirmation: password }], ["exportRecords", { format: "json", plaintextConfirmed: true, locale: "en-US" }]]) {
    const response = await page.evaluate(([method, value]) => value === undefined ? window.ledgernest[method]() : window.ledgernest[method](value), [method, value]);
    assert.equal(response.error.status, 401);
  }
  console.log("data UI: unlock and choose directory");
  await unlock(page); await dataPage(page);
  await page.getByRole("button", { name: "Choose backup directory", exact: true }).click();
  await page.getByText(cloud, { exact: true }).waitFor();
  assert.equal((await readFile(db + ".data-settings")).includes(Buffer.from(cloud)), false);
  await choices({ save: backup });
  console.log("data UI: backup");
  await action(page, "Create encrypted backup"); await page.getByRole("dialog").waitFor({ state: "detached" });
  assert.equal((await readFile(backup)).subarray(0, 8).toString(), "LNBACK01");
  assert.equal(await page.locator('input[type="password"]').count(), 0);
  const enCSV = resolve(dir, "english.csv"), json = resolve(dir, "records.json"), zhCSV = resolve(dir, "chinese.csv");
  console.log("data UI: exports");
  await exportFile(page, enCSV);
  assert.ok((await readFile(enCSV, "utf8")).startsWith("\ufeffid,vendorName,amount,currency,comment,"));
  await exportFile(page, json, "JSON");
  assert.equal(JSON.parse(await readFile(json, "utf8")).records.length, 32);
  await page.locator("#setting-tab-general").click(); await page.getByRole("combobox").first().press("Home"); await page.getByRole("combobox").first().press("ArrowDown"); await page.getByRole("combobox").first().press("Enter");
  await page.locator("#setting-tab-data").click();
  await exportFile(page, zhCSV, "CSV", "导出明文记录", "继续选择文件");
  assert.ok((await readFile(zhCSV, "utf8")).startsWith("\ufeff记录编号,收款方,金额,币种,备注,"));
  await mkdir(".local-tools/ui-check", { recursive: true });
  await page.screenshot({ path: ".local-tools/ui-check/data-zh-light.png", fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
  await page.screenshot({ path: ".local-tools/ui-check/data-zh-mobile.png", fullPage: true });
  await page.setViewportSize({ width: 1280, height: 850 });
  await page.locator("#setting-tab-general").click(); await page.getByRole("combobox").first().press("End"); await page.getByRole("combobox").first().press("Enter"); await page.locator("#setting-tab-data").click();
  const created = await page.evaluate(() => window.ledgernest.createBill({ bill: { vendorName: "Example after backup", amount: "1.23", comment: "", dueAt: "2026-10-20T00:00:00Z" }, idempotencyKey: "example_ui_after_backup_001" }));
  assert.equal(created.ok, true);
  console.log("data UI: restore validation");
  await action(page, "Restore from backup", "example-wrong-passphrase");
  await page.getByRole("dialog").getByRole("alert").waitFor();
  assert.equal((await page.evaluate(() => window.ledgernest.billPage({ page: 1 }))).value.total, 33);
  await page.getByRole("dialog").getByRole("button", { name: "Cancel", exact: true }).click(); await page.getByRole("dialog").waitFor({ state: "detached" });
  await choices({ confirm: false }); await action(page, "Restore from backup"); await page.getByRole("dialog").waitFor({ state: "detached" });
  assert.equal((await page.evaluate(() => window.ledgernest.billPage({ page: 1 }))).value.total, 33);
  await choices({ confirm: true }); await action(page, "Restore from backup"); await page.waitForURL(u => u.pathname === "/login");
  assert.equal((await page.evaluate(() => window.ledgernest.currentUser())).error.status, 401);
  await unlock(page);
  assert.equal((await page.evaluate(() => window.ledgernest.billPage({ page: 1 }))).value.total, 32);
  console.log("data UI: restart");
  await app.close(); app = undefined;
  page = await launch(); await unlock(page); await dataPage(page);
  await page.getByText(cloud, { exact: true }).waitFor();
  assert.equal((await page.evaluate(() => window.ledgernest.billPage({ page: 1 }))).value.total, 32);
  // Lock while a native save dialog is pending: discard the pending operation and all UI secrets.
  console.log("data UI: cancel pending dialog on lock");
  await choices({ save: resolve(dir, "must-not-exist.lnbackup"), hold: true }); await action(page, "Create encrypted backup");
  await app.evaluate(async () => { const deadline = Date.now() + 5000; while (!globalThis.releaseSave) { if (Date.now() > deadline) throw new Error("Save dialog was not opened"); await new Promise(resolve => setTimeout(resolve, 10)); } });
  await app.evaluate(({ powerMonitor }) => { powerMonitor.emit("lock-screen"); globalThis.releaseSave(); });
  await page.waitForURL(u => u.pathname === "/login");
  assert.equal(await page.locator('input[type="password"]').count(), 0);
  assert.equal(await readFile(resolve(dir, "must-not-exist.lnbackup")).then(() => true, () => false), false);
  // Recover at login even after the active database key is lost.
  console.log("data UI: lost-key recovery");
  const recoveredFiles = await readdir(db + ".restores");
  for (const file of recoveredFiles.filter(file => file.endsWith(".key"))) await rm(resolve(db + ".restores", file));
  await choices({ hold: false, confirm: true }); await action(page, "Restore from backup"); await page.getByRole("dialog").waitFor({ state: "detached" });
  await page.getByText("Backup restored. Unlock again to view your records.", { exact: true }).waitFor();
  await unlock(page);
  assert.equal((await page.evaluate(() => window.ledgernest.billPage({ page: 1 }))).value.total, 32);
  assert.deepEqual(errors, []); assert.deepEqual(requests, []);
  console.log(JSON.stringify({ directoryPersisted: true, encryptedBackup: true, exports: ["CSV en", "CSV zh", "JSON"], wrongPasswordAndCancelPreserveData: true, restartRestoreRecords: 32, lockCancelsSave: true, lostKeyRecovery: true, httpRequests: requests.length, rendererErrors: errors.length }));
} finally { if (app) await app.close(); await rm(dir, { recursive: true, force: true }); }
