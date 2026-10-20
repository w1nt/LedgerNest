import assert from "node:assert/strict";
import { _electron as electron } from "playwright";
import {
  mkdtemp,
  mkdir,
  rm,
  copyFile,
  writeFile,
  readFile,
  stat,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { DatabaseSync, backup } from "node:sqlite";
import { Store } from "../database.ts";
import { seedExample } from "../fixtures.ts";
const dir = await mkdtemp(resolve(tmpdir(), "ledgernest-electron-"));
const dbPath = resolve(dir, "test.sqlite");
const source = process.env.LEDGERNEST_VERIFY_SOURCE;
if (source) {
  const header = (await readFile(resolve(source))).subarray(0, 16).toString();
  if (header === "SQLite format 3\0") {
    const db = new DatabaseSync(resolve(source), { readOnly: true });
    try {
      await backup(db, dbPath);
    } finally {
      db.close();
    }
  } else {
    // Encrypted source verification requires a closed app and a checkpointed file.
    if (
      await stat(resolve(source) + ".lock").then(
        () => true,
        () => false,
      )
    )
      throw new Error("Close the source database first.");
    if (
      await stat(resolve(source) + "-wal").then(
        (s) => s.size > 0,
        () => false,
      )
    )
      throw new Error("Checkpoint the source database first.");
    await copyFile(resolve(source), dbPath);
    await copyFile(resolve(source) + ".key", dbPath + ".key");
  }
} else {
  // Deliberately plain LEGACY fixture, isolated under temp: exercise the actual encrypted migration.
  const store = new Store(":memory:", resolve("database/schema.sql"));
  try {
    await seedExample(store, new Date(2026, 9, 18));
    await writeFile(dbPath, store.db.serialize(), { mode: 0o600 });
  } finally {
    store.close();
  }
}
const env = {
  ...process.env,
  LEDGERNEST_TEST_AUTH_FIRST_CANCEL: "1",
  LEDGERNEST_DB_PATH: dbPath,
  LEDGERNEST_TEST_PROFILE: resolve(dir, "profile"),
  TZ: "America/Los_Angeles",
};
delete env.ELECTRON_RUN_AS_NODE;
let app;
const errors = [],
  requests = [];
try {
  app = await electron.launch({
    args: [resolve(".local-tools/device-auth-tests/main.cjs")],
    cwd: process.cwd(),
    env,
    timeout: 30000,
  });
  const page = await app.firstWindow();
  page.setDefaultTimeout(10000);
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("request", (request) => {
    if (/^https?:/u.test(request.url())) requests.push(request.url());
  });
  await page.waitForFunction(() => !!window.ledgernest);
  console.log("Electron window and preload ready.");
  const beforeUnlock = await readFile(dbPath);
  assert.equal(
    await stat(dbPath + ".lock").then(
      () => true,
      () => false,
    ),
    false,
  );
  const sandbox = await page.evaluate(() => ({
    node: typeof window.require,
    process: typeof window.process,
    methods: Object.keys(window.ledgernest).sort(),
  }));
  sandbox.methods.sort();
  assert.deepEqual(sandbox, {
    node: "undefined",
    process: "undefined",
    methods: [
      "cloudState", "cloudImport", "cloudConnect", "cloudSave", "cloudSync", "cloudDisconnect", "cloudList", "cloudDownload", "cloudCancel",
      "backupData",
      "backupLocation",
      "chooseBackupDirectory",
      "exportRecords",
      "restoreData",
      "billPage",
      "createBill",
      "currentUser",
      "deviceStatus",
      "logout",
      "onLocked",
      "unlock",
      "settings",
      "saveSecurity",
      "saveIntegration",
      "removeIntegration",
    ].sort(),
  });
  const security = await app.evaluate(({ BrowserWindow }) => {
    const win = BrowserWindow.getAllWindows()[0];
    const p = win.webContents.getLastWebPreferences();
    return {
      sandbox: p.sandbox,
      contextIsolation: p.contextIsolation,
      nodeIntegration: p.nodeIntegration,
      visible: win.isVisible(),
    };
  });
  assert.deepEqual(security, {
    sandbox: true,
    contextIsolation: true,
    nodeIntegration: false,
    visible: false,
  });
  assert.equal(
    (await page.evaluate(() => window.ledgernest.billPage({ page: 1 }))).error
      .status,
    401,
  );
  const forbidden = await app.evaluate(async ({ BrowserWindow }, preload) => {
    const rogue = new BrowserWindow({
      show: false,
      webPreferences: {
        preload,
        sandbox: true,
        contextIsolation: true,
        nodeIntegration: false,
      },
    });
    try {
      await rogue.loadURL("ledgernest://app/login");
      return await rogue.webContents.executeJavaScript(
        "window.ledgernest.currentUser()",
      );
    } finally {
      rogue.destroy();
    }
  }, resolve("desktop/dist/preload.cjs"));
  assert.equal(forbidden.error.status, 403);
  await page.evaluate(() => window.open("https://example.com/"));
  assert.equal(
    await app.evaluate(
      ({ BrowserWindow }) => BrowserWindow.getAllWindows().length,
    ),
    1,
  );

  await page.goto("ledgernest://app/login");
  assert.equal(
    await page.locator("input[type=password], input[type=email]").count(),
    0,
  );
  // Screenshot the actual React screen. All fixtures and the verification provider are isolated from production.
  await mkdir(".local-tools/ui-check", { recursive: true });
  if ((await page.locator(".unlock-language").innerText()).trim() === "中文")
    await page.locator(".unlock-language").click();
  await page.getByRole("heading", { name: "欢迎回来。" }).waitFor();
  await page.locator(".theme-control button").nth(0).click();
  await page.screenshot({
    path: ".local-tools/ui-check/unlock-zh-light.png",
    fullPage: true,
  });
  await page.locator(".theme-control button").nth(1).click();
  await page.screenshot({
    path: ".local-tools/ui-check/unlock-zh-dark.png",
    fullPage: true,
  });
  await page.setViewportSize({ width: 390, height: 844 });
  assert.equal(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
    true,
  );
  await page.screenshot({
    path: ".local-tools/ui-check/unlock-compact.png",
    fullPage: true,
  });
  await page.setViewportSize({ width: 1280, height: 850 });
  await page.locator(".theme-control button").nth(0).click();
  await page.locator(".unlock-language").click();
  await page.getByRole("heading", { name: "Welcome back." }).waitFor();
  await page.screenshot({
    path: ".local-tools/ui-check/unlock-en-light.png",
    fullPage: true,
  });
  await page.getByTestId("device-unlock").click();
  await page.getByRole("alert").waitFor();
  assert.deepEqual(await readFile(dbPath), beforeUnlock);
  assert.equal(
    await stat(dbPath + ".lock").then(
      () => true,
      () => false,
    ),
    false,
  );
  assert.equal(
    (await page.evaluate(() => window.ledgernest.currentUser())).error.status,
    401,
  );
  await page.getByTestId("device-unlock").click();
  await page.waitForURL((url) => url.pathname.startsWith("/home/"));
  const cipherFile = await readFile(dbPath);
  assert.notEqual(cipherFile.subarray(0, 16).toString(), "SQLite format 3\0");
  assert.ok(!cipherFile.includes(Buffer.from("example@example.com")));
  assert.ok((await readFile(dbPath + ".key")).length > 32);
  const initial = await page.evaluate(() =>
    window.ledgernest.billPage({ page: 1 }),
  );
  assert.equal(initial.ok, true);
  assert.equal(initial.value.total, 32);
  await page.locator("input[type=month]").fill("2026-10");
  await page.waitForFunction(() =>
    document
      .querySelector(".summary-card.featured > strong")
      ?.textContent?.includes("1,734.62"),
  );
  const amounts = await page
    .locator(".summary-card > strong")
    .allTextContents();
  assert.ok(amounts[1].includes("1,402.23"));
  assert.ok(amounts[2].includes("332.39"));
  const bars = await page.locator(".chart-bar").evaluateAll((nodes) =>
    nodes.map((node) => ({
      month: node.dataset.month,
      total: Number(node.querySelector(".chart-total").getAttribute("height")),
      paid: Number(node.querySelector(".chart-paid").getAttribute("height")),
    })),
  );
  const rows = initial.value.items.filter(
    (b) => b.settlementStatus !== "voided",
  );
  const months = await page.evaluate(
    (items) =>
      items.map((b) => {
        const d = new Date(b.dueAt);
        return {
          id: b.id,
          month: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`,
        };
      }),
    rows,
  );
  const byId = new Map(months.map((x) => [x.id, x.month]));
  const cents = (x) => Math.round(Number(x) * 100);
  const totals = bars.map((bar) =>
    rows
      .filter((b) => byId.get(b.id) === bar.month)
      .reduce((sum, b) => sum + cents(b.amount), 0),
  );
  const ceiling = Math.ceil(Math.max(10000, ...totals) / 10000) * 10000;
  assert.equal(bars.length, 6);
  for (let i = 0; i < bars.length; i++) {
    const paid = rows
      .filter((b) => byId.get(b.id) === bars[i].month)
      .reduce(
        (sum, b) =>
          sum +
          Math.min(cents(b.amount), Math.max(0, cents(b.confirmedAmount))),
        0,
      );
    assert.ok(Math.abs(bars[i].total - (totals[i] / ceiling) * 174) < 0.00001);
    assert.ok(Math.abs(bars[i].paid - (paid / ceiling) * 174) < 0.00001);
  }
  await page.reload();
  await page.waitForFunction(() =>
    document
      .querySelector(".summary-card.featured > strong")
      ?.textContent?.includes("1,734.62"),
  );
  assert.equal(await page.locator(".demo-banner").count(), 0);
  const malformed = await page.evaluate(() =>
    window.ledgernest.createBill({
      bill: {
        amount: "1.001",
        vendorName: "Bad",
        comment: "",
        dueAt: "2026-10-18T00:00:00Z",
      },
      idempotencyKey: "example_invalid_0001",
    }),
  );
  assert.equal(malformed.error.status, 400);
  await page.goto("ledgernest://app/create-bill");
  console.log("Chart totals, sandbox, sender rejection and reload passed.");
  // Exercise the real form, not only the IPC fixture utility.
  await page
    .locator(".bill-form input:not([type])")
    .fill("Example desktop IPC");
  await page.locator(".bill-form input[type=number]").fill("12.34");
  await page.locator("input[type=date]").fill("2026-10-20");
  await page.locator("textarea").fill("Synthetic desktop integration check");
  await page.locator("form button[type=submit]").click();
  await page.waitForURL("**/home/bills**");
  const after = await page.evaluate(() =>
    window.ledgernest.billPage({ page: 1 }),
  );
  assert.equal(after.value.total, 33);
  const saved = after.value.items.find(
    (b) => b.vendorName === "Example desktop IPC",
  );
  assert.equal(saved.amount, "12.34");
  assert.equal(saved.settlementStatus, "unpaid");
  await page.goto("ledgernest://app/home/settings");
  await page.locator("#setting-tab-security").click();
  await page.locator(".logout-panel button").click();
  await page.waitForURL((url) => ["/", "/login"].includes(url.pathname));
  assert.equal(
    (await page.evaluate(() => window.ledgernest.currentUser())).error.status,
    401,
  );
  await page.waitForURL((url) => ["/", "/login"].includes(url.pathname));
  assert.equal(
    await stat(dbPath + ".lock").then(
      () => true,
      () => false,
    ),
    false,
  );
  assert.equal(
    (await page.evaluate(() => window.ledgernest.billPage({ page: 1 }))).error
      .status,
    401,
  );
  await page.getByTestId("device-unlock").click();
  await page.waitForURL((url) => url.pathname.startsWith("/home/"));
  await app.evaluate(({ powerMonitor }) => powerMonitor.emit("lock-screen"));
  await page.waitForURL("**/login");
  assert.equal(
    await stat(dbPath + ".lock").then(
      () => true,
      () => false,
    ),
    false,
  );
  await page.getByTestId("device-unlock").click();
  await page.waitForURL((url) => url.pathname.startsWith("/home/"));
  assert.deepEqual(errors, []);
  assert.deepEqual(requests, []);
  // Simulate an abrupt process death: the encrypted WAL and OS key must survive without app.quit().
  const closed = app.waitForEvent("close", { timeout: 10000 });
  await app.evaluate(() => {
    setTimeout(() => process.exit(9), 100);
  });
  await closed;
  app = undefined;
  env.LEDGERNEST_TEST_PROFILE = resolve(dir, "fresh-profile-after-crash");
  delete env.LEDGERNEST_TEST_AUTH_FIRST_CANCEL;
  // New process reopens the same file; session must not persist, bills must persist.
  app = await electron.launch({
    args: [resolve(".local-tools/device-auth-tests/main.cjs")],
    cwd: process.cwd(),
    env,
  });
  const restarted = await app.firstWindow();
  await restarted.waitForFunction(() => !!window.ledgernest);
  assert.equal(
    (await restarted.evaluate(() => window.ledgernest.currentUser())).error
      .status,
    401,
  );
  assert.equal(
    (
      await restarted.evaluate(() =>
        window.ledgernest.unlock({ locale: "en-US" }),
      )
    ).ok,
    true,
  );
  assert.equal(
    (await restarted.evaluate(() => window.ledgernest.billPage({ page: 1 })))
      .value.total,
    33,
  );
  console.log(
    JSON.stringify({
      source: source ? "existing-data-backup" : "isolated-synthetic",
      bills: 32,
      summary: amounts,
      chartMonths: 6,
      formCreate: true,
      restartPersistence: true,
      crashRecovery: true,
      canceledVerificationPreservesDatabase: true,
      lockScreenClosesDatabase: true,
      sandbox: true,
      httpRequests: requests.length,
      pageErrors: errors.length,
    }),
  );
} finally {
  if (app) await app.close();
  await rm(dir, {
    recursive: true,
    force: true,
    maxRetries: 10,
    retryDelay: 200,
  });
}
