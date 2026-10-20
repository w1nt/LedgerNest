import assert from "node:assert/strict";
import { _electron as electron } from "playwright";
import { mkdtemp, readFile, writeFile, rm, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { Store } from "../database.ts";
import { seedExample } from "../fixtures.ts";
const dir = await mkdtemp(resolve(tmpdir(), "ledgernest-cloud-ui-")), db = resolve(dir, "example.sqlite"), client = resolve(dir, "example-oauth.json"), download = resolve(dir, "example-downloaded.lnbackup");
const clientId = "example-desktop-client.apps.googleusercontent.com", secret = "example-client-secret-1234", password = "example-cloud-backup-passphrase";
await writeFile(client, JSON.stringify({ installed: { client_id: clientId, client_secret: secret, token_uri: "https://oauth2.googleapis.com/token" } }));
const seed = new Store(":memory:", resolve("database/schema.sql")); await seedExample(seed, new Date(2026, 9, 18)); await writeFile(db, seed.db.serialize()); seed.close();
const env = { ...process.env, LEDGERNEST_DB_PATH: db, LEDGERNEST_TEST_PROFILE: resolve(dir, "profile"), LEDGERNEST_TEST_CLOUD_CLIENT: client };
delete env.ELECTRON_RUN_AS_NODE; delete env.LEDGERNEST_TEST_AUTH_FIRST_CANCEL;
const requests = [], errors = []; let app;
async function launch() {
  app = await electron.launch({ args: [resolve(".local-tools/device-auth-tests/main.cjs")], cwd: process.cwd(), env });
  await app.evaluate(({ dialog }, path) => { dialog.showSaveDialog = async () => ({ canceled: false, filePath: path }); }, download);
  const page = await app.firstWindow(); page.setDefaultTimeout(20000); await page.emulateMedia({ reducedMotion: "reduce" });
  page.on("request", r => { if (/^https?:/u.test(r.url())) requests.push(r.url()); }); page.on("pageerror", e => errors.push(e.message));
  await page.waitForFunction(() => !!window.ledgernest); return page;
}
async function unlock(page) { await page.getByTestId("device-unlock").click(); await page.waitForURL(u => u.pathname.startsWith("/home/")); }
async function settings(page) { await page.goto("ledgernest://app/home/settings"); await page.locator("#setting-tab-data").click(); }
async function waitCloud(page, source) { await page.waitForFunction(async source => { const r = await window.ledgernest.cloudState(); return r.ok && r.value.phase === "idle" && (source === "success" ? !!r.value.lastSuccessAt : source === "connected" ? r.value.connected : source === "disconnected" ? !r.value.connected : true); }, source, { polling: 1000 }); }
try {
  console.log("cloud UI: launch and access gating");
  let page = await launch(); await page.evaluate(() => localStorage.setItem("billing-language", "en-US")); await page.reload();
  for (const [method, value] of [["cloudState"], ["cloudImport"], ["cloudConnect"], ["cloudList"], ["cloudSync"], ["cloudDisconnect"], ["cloudCancel"], ["cloudSave", {}], ["cloudDownload", { id: "example_backup_001" }]]) {
    const result = await page.evaluate(([method, value]) => value === undefined ? window.ledgernest[method]() : window.ledgernest[method](value), [method, value]); assert.equal(result.error.status, 401);
  }
  await unlock(page); await settings(page);
  let state = (await page.evaluate(() => window.ledgernest.cloudState())).value;
  assert.equal(state.enabled, false); assert.equal(state.automatic, false); assert.equal(state.intervalHours, 24);
  await page.getByRole("button", { name: "Import desktop OAuth configuration", exact: true }).click();
  await page.getByRole("button", { name: "Connect Google Drive", exact: true }).click(); await waitCloud(page, "connected");
  await page.getByRole("button", { name: "Sync settings", exact: true }).click();
  let modal = page.getByRole("dialog");
  const checkboxWidth = await modal.getByLabel("Enable Google Drive sync", { exact: true }).evaluate(input => input.getBoundingClientRect().width);
  assert.ok(checkboxWidth < 30);
  assert.equal(await modal.getByLabel("Automatic sync interval (hours, 1–720)", { exact: true }).inputValue(), "24");
  await modal.getByLabel("Enable Google Drive sync", { exact: true }).check();
  await modal.getByLabel("Google Drive folder name", { exact: true }).fill("example-cloud-backups");
  await modal.getByLabel("Backup filename prefix", { exact: true }).fill("example");
  await modal.getByLabel("Backup passphrase", { exact: true }).fill(password);
  await modal.getByLabel("Repeat backup passphrase", { exact: true }).fill(password);
  await modal.getByRole("checkbox").last().check();
  await modal.getByRole("button", { name: "Save sync settings", exact: true }).click(); await modal.waitFor({ state: "detached" });
  assert.equal(await page.locator('input[type="password"]').count(), 0);
  console.log("cloud UI: manual upload, encrypted storage and download");
  await page.getByRole("button", { name: "Sync to Google Drive now", exact: true }).click(); await waitCloud(page, "success");
  await page.getByText("Encrypted backup uploaded; file size and checksum verified.", { exact: true }).waitFor();
  assert.equal(await app.evaluate(() => globalThis.cloudTest.uploads()), 1);
  const encrypted = await readFile(db + ".cloud-settings");
  const publicState = JSON.stringify((await page.evaluate(() => window.ledgernest.cloudState())).value);
  const body = await page.locator("body").innerText();
  for (const value of [clientId, secret, password, "example-refresh-token-5678", "example-access-token-1234"]) { assert.equal(encrypted.includes(Buffer.from(value)), false); assert.equal(publicState.includes(value), false); assert.equal(body.includes(value), false); }
  assert.equal(await page.evaluate(() => localStorage.getItem("apiKey")), null);
  await page.getByRole("button", { name: "View cloud backups", exact: true }).click(); await page.getByRole("button", { name: "Download encrypted backup", exact: true }).waitFor();
  await page.getByRole("button", { name: "Download encrypted backup", exact: true }).click();
  await page.getByText("Encrypted backup downloaded. Use Restore from backup with its original passphrase.", { exact: true }).waitFor();
  assert.equal((await readFile(download)).subarray(0, 8).toString(), "LNBACK01");
  await mkdir(".local-tools/ui-check", { recursive: true }); await page.evaluate(() => window.scrollTo(0, 0)); await page.screenshot({ path: ".local-tools/ui-check/cloud-en-desktop.png", fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 }); assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true); await page.screenshot({ path: ".local-tools/ui-check/cloud-en-mobile.png", fullPage: true }); await page.setViewportSize({ width: 1280, height: 850 });
  console.log("cloud UI: interval, overdue upload and lock cancellation");
  await page.getByRole("button", { name: "Sync settings", exact: true }).click(); modal = page.getByRole("dialog");
  await modal.getByLabel("Automatic sync", { exact: true }).check(); await modal.getByLabel("Automatic sync interval (hours, 1–720)", { exact: true }).fill("3");
  await modal.getByRole("button", { name: "Save sync settings", exact: true }).click(); await modal.waitFor({ state: "detached" });
  state = (await page.evaluate(() => window.ledgernest.cloudState())).value; assert.equal(state.automatic, true); assert.equal(state.intervalHours, 3);
  await app.evaluate(({ powerMonitor }) => { globalThis.cloudTest.advance(3); powerMonitor.emit("lock-screen"); }); await page.waitForURL(u => u.pathname === "/login");
  assert.equal(await app.evaluate(() => globalThis.cloudTest.uploads()), 1);
  await unlock(page); await settings(page); await waitCloud(page, "success"); assert.equal(await app.evaluate(() => globalThis.cloudTest.uploads()), 2);
  await app.evaluate(() => { globalThis.cloudTest.pause = true; });
  await page.getByRole("button", { name: "Sync to Google Drive now", exact: true }).click();
  await page.waitForFunction(async () => { const r = await window.ledgernest.cloudState(); return r.ok && r.value.phase === "uploading"; }, undefined, { polling: 500 });
  await app.evaluate(({ powerMonitor }) => { powerMonitor.emit("lock-screen"); globalThis.cloudTest.release?.(); globalThis.cloudTest.pause = false; });
  await page.waitForURL(u => u.pathname === "/login");
  assert.equal(await app.evaluate(() => globalThis.cloudTest.uploads()), 2);
  await unlock(page); await settings(page);
  assert.equal((await page.evaluate(() => window.ledgernest.billPage({ page: 1 }))).value.total, 32);
  // Stop automatic mode for restart so the fixed fixture clock cannot trigger an unintended catch-up.
  const previous = (await page.evaluate(() => window.ledgernest.cloudState())).value;
  const saved = await page.evaluate(v => window.ledgernest.cloudSave({ enabled: true, automatic: false, intervalHours: v.intervalHours, folderName: v.folderName, filePrefix: v.filePrefix, password: "", confirmation: "", rememberConfirmed: false }), previous); assert.equal(saved.ok, true);
  const success = saved.value.lastSuccessAt;
  await page.locator("#setting-tab-general").click();
  await page.getByRole("combobox").first().press("Home"); await page.getByRole("combobox").first().press("ArrowDown"); await page.getByRole("combobox").first().press("Enter");
  await page.locator("#setting-tab-data").click(); await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({ path: ".local-tools/ui-check/cloud-zh-desktop.png", fullPage: true });
  await page.getByRole("button", { name: "同步设置", exact: true }).click();
  await page.screenshot({ path: ".local-tools/ui-check/cloud-zh-settings.png", fullPage: false });
  await page.getByRole("dialog").getByRole("button", { name: "取消", exact: true }).click(); await page.getByRole("dialog").waitFor({ state: "detached" });
  await page.locator("#setting-tab-general").click(); await page.getByRole("combobox").first().press("End"); await page.getByRole("combobox").first().press("Enter"); await page.locator("#setting-tab-data").click();
  await app.close(); app = undefined; page = await launch(); await unlock(page); await settings(page);
  state = (await page.evaluate(() => window.ledgernest.cloudState())).value; assert.equal(state.connected, true); assert.equal(state.enabled, true); assert.equal(state.intervalHours, 3); assert.equal(state.lastSuccessAt, success);
  await page.getByRole("button", { name: "Disconnect", exact: true }).click(); await page.getByRole("dialog").getByRole("button", { name: "Disconnect", exact: true }).click(); await page.getByRole("dialog").waitFor({ state: "detached" });
  await waitCloud(page, "disconnected"); state = (await page.evaluate(() => window.ledgernest.cloudState())).value; assert.equal(state.passwordSet, false); assert.equal(state.enabled, false);
  assert.deepEqual(errors, []); assert.deepEqual(requests, []);
  console.log(JSON.stringify({ GoogleTransport: "isolated fixture", authorizationGated: true, dailyDefault: true, manualUpload: true, encryptedCredentialsAndPassphrase: true, cloudDownload: true, customIntervalHours: 3, lockedPauseAndUnlockCatchup: true, lockCancelsUpload: true, restartPersistence: true, disconnectClearsTokensAndPassphrase: true, retainedBills: 32, rendererHttp: requests.length, rendererErrors: errors.length }));
} finally { if (app) await app.close(); await rm(dir, { recursive: true, force: true }); }
