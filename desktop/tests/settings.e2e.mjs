import assert from "node:assert/strict";
import { _electron as electron } from "playwright";
import {
  mkdtemp,
  rm,
  readFile,
  writeFile,
  mkdir,
  stat,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { Store } from "../database.ts";
import { seedExample } from "../fixtures.ts";
const dir = await mkdtemp(resolve(tmpdir(), "ledgernest-settings-ui-")),
  db = resolve(dir, "example.sqlite");
const store = new Store(":memory:", resolve("database/schema.sql"));
await seedExample(store, new Date(2026, 9, 18));
await writeFile(db, store.db.serialize());
store.close();
const env = {
  ...process.env,
  LEDGERNEST_DB_PATH: db,
  LEDGERNEST_TEST_PROFILE: resolve(dir, "profile"),
};
delete env.ELECTRON_RUN_AS_NODE;
delete env.LEDGERNEST_TEST_AUTH_FIRST_CANCEL;
const entry = resolve(".local-tools/device-auth-tests/main.cjs"),
  plaidId = "example-client-identifier-1234",
  plaidSecret = "example-plaid-credential-5678",
  aiKey = "example-ai-credential-9012";
let app;
const errors = [],
  requests = [];
async function launch() {
  app = await electron.launch({ args: [entry], cwd: process.cwd(), env });
  const page = await app.firstWindow();
  page.setDefaultTimeout(15000);
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("request", (request) => {
    if (/^https?:/u.test(request.url())) requests.push(request.url());
  });
  await page.waitForFunction(() => !!window.ledgernest);
  return page;
}
async function unlock(page) {
  await page.getByTestId("device-unlock").click();
  await page.waitForURL((url) => url.pathname.startsWith("/home/"));
}
async function english(page) {
  await page.locator("#setting-tab-general").click();
  await page.getByRole("combobox").first().click();
  await page.getByRole("option", { name: "English", exact: true }).click();
  await page.getByRole("tab", { name: "Appearance", exact: true }).waitFor();
}
try {
  let page = await launch();
  await page.emulateMedia({ reducedMotion: "no-preference" });
  for (const [method, input] of [
    ["settings"],
    ["saveSecurity", { idleMinutes: 5 }],
    ["saveIntegration", { kind: "ai" }],
    ["removeIntegration", { kind: "plaid" }],
  ]) {
    const result = await page.evaluate(
      ([method, input]) =>
        input === undefined
          ? window.ledgernest[method]()
          : window.ledgernest[method](input),
      [method, input],
    );
    assert.equal(result.error.status, 401);
  }
  assert.equal(
    await stat(db + ".settings").then(
      () => true,
      () => false,
    ),
    false,
  );
  await page.getByTestId("device-unlock").click();
  await page.locator('.unlock-page[data-phase="verified"]').waitFor();
  // OS locking during the success animation must cancel the handoff, not reveal records.
  await app.evaluate(({ powerMonitor }) => powerMonitor.emit("lock-screen"));
  await page.locator('.unlock-page[data-phase="idle"]').waitFor();
  assert.equal(
    (await page.evaluate(() => window.ledgernest.currentUser())).error.status,
    401,
  );
  await page.getByTestId("device-unlock").click();

  await page.waitForURL((url) => url.pathname.startsWith("/home/"));
  await page.goto("ledgernest://app/home/settings");
  await english(page);
  await page.getByRole("button", { name: "Compact", exact: true }).click();
  assert.equal(
    await page.evaluate(() => document.documentElement.dataset.density),
    "compact",
  );
  await page.getByRole("combobox", { name: "Motion", exact: true }).click();
  await page
    .getByRole("option", { name: "Reduce motion", exact: true })
    .click();
  assert.equal(
    await page.evaluate(
      () =>
        getComputedStyle(document.querySelector(".settings-tab-content"))
          .animationName,
    ),
    "none",
  );
  await page.reload();
  await page.getByRole("tab", { name: "Appearance", exact: true }).waitFor();
  assert.equal(
    await page.evaluate(() => document.documentElement.dataset.density),
    "compact",
  );
  assert.equal(
    await page.evaluate(() => document.documentElement.dataset.motion),
    "reduce",
  );
  await mkdir(".local-tools/ui-check", { recursive: true });
  await page.locator(".settings-page h1").click();
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({
    path: ".local-tools/ui-check/settings-appearance-en.png",
    fullPage: true,
  });
  await page.locator("#setting-tab-connections").click();
  await page.getByTestId("configure-plaid").click();
  const dialog = page.getByRole("dialog");
  await dialog.locator('input[name="plaid-client-id"]').fill(plaidId);
  await dialog.locator('input[name="plaid-secret"]').fill(plaidSecret);
  assert.equal(
    await dialog.locator('input[name="plaid-secret"]').getAttribute("type"),
    "password",
  );
  await page.screenshot({
    path: ".local-tools/ui-check/settings-plaid-dialog.png",
    fullPage: true,
  });
  assert.equal(
    await dialog
      .locator('input[name="plaid-secret"]')
      .evaluate(
        (node) =>
          !node.dispatchEvent(
            new ClipboardEvent("copy", { bubbles: true, cancelable: true }),
          ),
      ),
    true,
  );
  await dialog
    .getByRole("button", { name: "Save configuration", exact: true })
    .click();
  await dialog.waitFor({ state: "hidden" });
  assert.equal(
    await page.evaluate(() =>
      document.activeElement?.getAttribute("data-testid"),
    ),
    "configure-plaid",
  );
  let settings = await page.evaluate(() => window.ledgernest.settings());
  assert.equal(settings.ok, true);
  assert.equal(settings.value.plaid.clientId, "exam••••••••1234");
  assert.equal(settings.value.plaid.secret, "exam••••••••5678");
  await page.getByTestId("configure-plaid").click();
  assert.equal(
    await dialog.locator('input[name="plaid-secret"]').inputValue(),
    "",
  );
  assert.equal(
    await dialog.locator('input[name="plaid-client-id"]').inputValue(),
    "",
  );
  await dialog
    .getByRole("button", { name: "Save configuration", exact: true })
    .click();
  await dialog.waitFor({ state: "hidden" });
  await page.getByTestId("configure-ai").click();
  await dialog.getByRole("combobox", { name: "Provider", exact: true }).click();
  await page
    .getByRole("option", { name: "Custom · OpenAI compatible", exact: true })
    .click();
  await dialog.locator('input[name="base-url"]').fill("https://example.com/v1");
  await dialog.locator('input[name="model"]').fill("example-model");
  await dialog.locator('input[name="ai-api-key"]').fill(aiKey);
  await dialog
    .getByRole("button", { name: "Save configuration", exact: true })
    .click();
  await dialog.waitFor({ state: "hidden" });
  settings = await page.evaluate(() => window.ledgernest.settings());
  assert.equal(settings.value.ai.apiKey, "exam••••••••9012");
  assert.equal(settings.value.ai.configured, true);
  const uiStores = await page.evaluate(() =>
    JSON.stringify({
      local: { ...localStorage },
      session: { ...sessionStorage },
    }),
  );
  for (const secret of [plaidId, plaidSecret, aiKey])
    assert.equal(uiStores.includes(secret), false);
  const bytes = await readFile(db + ".settings");
  for (const secret of [plaidId, plaidSecret, aiKey]) {
    assert.equal(bytes.includes(Buffer.from(secret)), false);
    assert.equal(JSON.stringify(settings).includes(secret), false);
    assert.equal((await page.content()).includes(secret), false);
  }
  assert.equal(
    await page
      .getByTestId("masked-credential")
      .first()
      .evaluate((node) => getComputedStyle(node).userSelect),
    "none",
  );
  assert.equal(
    await page
      .getByTestId("masked-credential")
      .first()
      .evaluate(
        (node) =>
          !node.dispatchEvent(
            new ClipboardEvent("copy", { bubbles: true, cancelable: true }),
          ),
      ),
    true,
  );
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.locator(".settings-page h1").click();
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({
    path: ".local-tools/ui-check/settings-connections-en.png",
    fullPage: true,
  });
  await page.locator("#setting-tab-security").click();
  await page
    .getByRole("combobox", { name: "Automatic lock", exact: true })
    .click();
  await page.getByRole("option", { name: "5 minutes", exact: true }).click();
  await page
    .getByRole("status")
    .filter({ hasText: "Settings saved on this device." })
    .waitFor();
  await app.close();
  app = undefined;
  page = await launch();
  await unlock(page);
  settings = await page.evaluate(() => window.ledgernest.settings());
  assert.equal(settings.value.idleMinutes, 5);
  assert.equal(settings.value.plaid.configured, true);
  assert.equal(settings.value.ai.configured, true);
  assert.equal(
    (await page.evaluate(() => window.ledgernest.billPage({ page: 1 }))).value
      .total,
    32,
  );
  await page.goto("ledgernest://app/home/settings");
  await english(page);
  await page.locator("#setting-tab-connections").click();
  const aiPanel = page.locator(".integration-panel").nth(1);
  await aiPanel.getByRole("button", { name: "Remove", exact: true }).click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Cancel", exact: true })
    .click();
  await page.getByRole("dialog").waitFor({ state: "hidden" });
  assert.equal(
    (await page.evaluate(() => window.ledgernest.settings())).value.ai
      .configured,
    true,
  );
  await aiPanel.getByRole("button", { name: "Remove", exact: true }).click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Remove configuration", exact: true })
    .click();
  await page.getByRole("dialog").waitFor({ state: "hidden" });
  assert.equal(
    (await page.evaluate(() => window.ledgernest.settings())).value.ai.apiKey,
    null,
  );
  await page.locator("#setting-tab-general").click();
  await page.getByRole("combobox").first().click();
  await page.getByRole("option", { name: "简体中文", exact: true }).click();
  await page.locator(".setting-row .theme-control button").nth(1).click();
  await page.locator("#setting-tab-connections").click();
  await page.locator(".settings-page h1").click();
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({
    path: ".local-tools/ui-check/settings-connections-zh-dark.png",
    fullPage: true,
  });
  await page.setViewportSize({ width: 390, height: 844 });
  assert.equal(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
    true,
  );
  await page.locator(".settings-page h1").click();
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({
    path: ".local-tools/ui-check/settings-compact-zh.png",
    fullPage: true,
  });
  await page.setViewportSize({ width: 1280, height: 850 });
  await page.locator("#setting-tab-general").click();
  await page.getByRole("combobox", { name: "动态效果", exact: true }).click();
  await page.getByRole("option", { name: "跟随系统", exact: true }).click();
  await page.emulateMedia({ reducedMotion: "reduce" });
  assert.equal(
    await page.evaluate(
      () =>
        getComputedStyle(document.querySelector(".settings-tab-content"))
          .animationName,
    ),
    "none",
  );
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await page.locator("#setting-tab-connections").click();
  await page.getByTestId("configure-plaid").click();
  await page
    .getByRole("dialog")
    .locator('input[name="plaid-secret"]')
    .fill("example-unsaved-private-key");
  await app.evaluate(({ powerMonitor }) => powerMonitor.emit("lock-screen"));
  await page.waitForURL("**/login");
  assert.equal(await page.getByRole("dialog").count(), 0);
  assert.equal(
    (await page.content()).includes("example-unsaved-private-key"),
    false,
  );
  assert.equal(
    (await page.evaluate(() => window.ledgernest.settings())).error.status,
    401,
  );
  await page.locator(".unlock-demo button").click();
  await page.waitForURL((url) => url.pathname.startsWith("/home/"));
  await page.goto("ledgernest://app/home/settings");
  await page.locator("#setting-tab-connections").click();
  assert.equal(await page.getByTestId("configure-plaid").isDisabled(), true);
  assert.equal(await page.getByTestId("configure-ai").isDisabled(), true);
  assert.deepEqual(errors, []);
  assert.deepEqual(requests, []);
  console.log(
    JSON.stringify({
      maskedOnlyIPC: true,
      encryptedCredentials: true,
      noCopy: true,
      blankKeepsCredential: true,
      restartPersistence: true,
      removeConfirmation: true,
      appearancePersistence: true,
      reducedMotion: true,
      customLockTimeout: true,
      lockClearsSecretForm: true,
      lockCancelsUnlockAnimation: true,
      demoReadOnly: true,
      httpRequests: 0,
      pageErrors: 0,
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
