import assert from "node:assert/strict";
import { _electron as electron } from "playwright";
import { mkdtemp, rm, stat, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
const dir = await mkdtemp(resolve(tmpdir(), "ledgernest-native-status-")),
  db = resolve(dir, "closed.sqlite");
const env = {
  ...process.env,
  LEDGERNEST_DB_PATH: db,
  LEDGERNEST_TEST_PROFILE: resolve(dir, "profile"),
};
delete env.ELECTRON_RUN_AS_NODE;
let app;
try {
  app = await electron.launch({
    args: [resolve(".local-tools/device-auth-tests/native.cjs")],
    cwd: process.cwd(),
    env,
  });
  const page = await app.firstWindow();
  await page.waitForFunction(() => !!window.ledgernest);
  const status = await page.evaluate(() => window.ledgernest.deviceStatus());
  assert.equal(status.ok, true);
  assert.ok(
    [
      "available",
      "not_configured",
      "disabled",
      "busy",
      "unavailable",
      "unsupported",
    ].includes(status.value.availability),
  );
  await page.waitForFunction(() => {
    const b = document.querySelector('[data-testid="device-unlock"]');
    return (
      b &&
      !document
        .querySelector(".unlock-method")
        .textContent.includes("Checking") &&
      !document.querySelector(".unlock-method").textContent.includes("正在检查")
    );
  });
  assert.equal(
    (await page.evaluate(() => window.ledgernest.currentUser())).error.status,
    401,
  );
  assert.equal(
    (await page.evaluate(() => window.ledgernest.billPage({ page: 1 }))).error
      .status,
    401,
  );
  for (const name of [db, db + ".key", db + ".lock"])
    assert.equal(
      await stat(name).then(
        () => true,
        () => false,
      ),
      false,
    );
  if (status.value.availability !== "available")
    assert.equal(await page.getByTestId("device-unlock").isDisabled(), true);
  await mkdir(".local-tools/ui-check", { recursive: true });
  await page.screenshot({
    path: ".local-tools/ui-check/unlock-native-availability.png",
    fullPage: true,
  });
  console.log(
    JSON.stringify({
      nativeAvailability: status.value,
      storageRemainsClosed: true,
      verificationPromptSubmitted: false,
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
