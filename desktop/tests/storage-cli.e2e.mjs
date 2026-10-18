import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, existsSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import electron from "electron";
const dir = mkdtempSync(resolve(tmpdir(), "ledgernest-storage-cli-"));
const db = resolve(dir, "example.sqlite"),
  file = resolve(dir, "example.lnbackup"),
  restored = resolve(dir, "restored.sqlite");
const password = "example-cli-backup-passphrase-2026";
const env = { ...process.env, LEDGERNEST_DB_PATH: db };
delete env.ELECTRON_RUN_AS_NODE;
delete env.LEDGERNEST_E2E;
env.LEDGERNEST_TEST_PROFILE = resolve(dir, "profile");
function run(command, args = [], passphrase, expected = 0, dbPath = db) {
  const result = spawnSync(
    electron,
    [
      resolve(".local-tools/device-auth-tests/main.cjs"),
      `--ledgernest-storage=${command}`,
      ...args,
    ],
    {
      cwd: process.cwd(),
      env: { ...env, LEDGERNEST_DB_PATH: dbPath },
      input: passphrase ? JSON.stringify({ password: passphrase }) : "",
      encoding: "utf8",
      windowsHide: true,
      timeout: 30000,
    },
  );
  assert.equal(
    result.status,
    expected,
    `${command}: ${result.stdout} ${result.stderr}`,
  );
  assert.ok(!result.stdout.includes(password));
  assert.ok(!result.stderr.includes(password));
  return result.stdout;
}
try {
  env.LEDGERNEST_TEST_AUTH_FIRST_CANCEL = "1";
  for (const [command, args] of [
    ["seed", []],
    ["encrypt", []],
    ["backup", [file]],
    ["restore", [file, restored]],
  ]) {
    run(command, args, undefined, 1);
    assert.ok(!existsSync(db));
    assert.ok(!existsSync(db + ".key"));
    assert.ok(!existsSync(file));
    assert.ok(!existsSync(restored));
  }
  delete env.LEDGERNEST_TEST_AUTH_FIRST_CANCEL;
  assert.match(run("seed"), /billCount: 32/);
  assert.notEqual(
    readFileSync(db).subarray(0, 16).toString(),
    "SQLite format 3\0",
  );
  run("backup", [file], password);
  assert.ok(existsSync(file));
  run(
    "restore",
    [file, resolve(dir, "wrong.sqlite")],
    "example-wrong-password",
    1,
  );
  assert.ok(!existsSync(resolve(dir, "wrong.sqlite")));
  run("restore", [file, restored], password);
  assert.match(
    run("seed", [], undefined, 0, restored),
    /created: 0, skipped: 32, billCount: 32/,
  );
  console.log(
    JSON.stringify({
      headlessSeed: true,
      canceledVerificationBlocksAllCommands: true,
      dpapiOrKeychain: true,
      backup: true,
      wrongPassphraseRejected: true,
      restore: true,
      preservedBills: 32,
    }),
  );
} finally {
  rmSync(dir, {
    recursive: true,
    force: true,
    maxRetries: 10,
    retryDelay: 200,
  });
}
