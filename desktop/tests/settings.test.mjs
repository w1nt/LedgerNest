import { test } from "node:test";
import assert from "node:assert/strict";
import { randomBytes, createCipheriv, createDecipheriv } from "node:crypto";
import {
  mkdtempSync,
  rmSync,
  readFileSync,
  writeFileSync,
  existsSync,
  readdirSync,
  linkSync,
  unlinkSync,
} from "node:fs";
import { resolve } from "node:path";
import { tmpdir } from "node:os";
import { SettingsStore, maskCredential } from "../settings.ts";
function protector() {
  const key = randomBytes(32);
  return {
    available: () => true,
    protect(value) {
      const iv = randomBytes(12),
        cipher = createCipheriv("aes-256-gcm", key, iv),
        body = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
      return Buffer.concat([iv, cipher.getAuthTag(), body]);
    },
    unprotect(value) {
      const cipher = createDecipheriv(
        "aes-256-gcm",
        key,
        value.subarray(0, 12),
      );
      cipher.setAuthTag(value.subarray(12, 28));
      return Buffer.concat([
        cipher.update(value.subarray(28)),
        cipher.final(),
      ]).toString("utf8");
    },
  };
}
function fixture(action) {
  const dir = mkdtempSync(resolve(tmpdir(), "ledgernest-settings-")),
    path = resolve(dir, "example.sqlite.settings"),
    p = protector(),
    store = new SettingsStore(path, p);
  try {
    return action({ dir, path, p, store });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}
const plaid = {
  kind: "plaid",
  environment: "sandbox",
  clientId: "example-client-id-123456",
  secret: "example-plaid-secret-123456",
};
const ai = {
  kind: "ai",
  provider: "deepseek",
  baseUrl: "https://api.deepseek.com",
  model: "example-model",
  apiKey: "example-ai-key-123456",
};
const invalid = (fn) => assert.throws(fn, (e) => e.status === 400);
test("settings defaults do not create files; encrypted round trips return only masked credentials and retain blank replacements", () =>
  fixture(({ path, store, p }) => {
    assert.equal(store.get().idleMinutes, 10);
    assert.equal(existsSync(path), false);
    let value = store.saveIntegration(plaid);
    assert.equal(value.plaid.clientId, "exam••••••••3456");
    assert.equal(value.plaid.configured, true);
    value = store.saveIntegration(ai);
    value = store.saveSecurity({ idleMinutes: 5 });
    assert.equal(value.idleMinutes, 5);
    const bytes = readFileSync(path);
    for (const key of [plaid.clientId, plaid.secret, ai.apiKey]) {
      assert.equal(bytes.includes(Buffer.from(key)), false);
      assert.equal(JSON.stringify(value).includes(key), false);
    }
    const reopened = new SettingsStore(path, p);
    assert.deepEqual(reopened.get(), value);
    assert.deepEqual(
      reopened.saveIntegration({ ...plaid, clientId: "", secret: "" }),
      value,
    );
    assert.equal(
      reopened.saveIntegration({ ...ai, apiKey: "" }).ai.apiKey,
      value.ai.apiKey,
    );
    assert.equal(reopened.removeIntegration({ kind: "ai" }).ai.apiKey, null);
    assert.equal(
      reopened.removeIntegration({ kind: "plaid" }).plaid.clientId,
      null,
    );
    assert.equal(maskCredential("tiny"), "••••••••");
    assert.equal(maskCredential(""), null);
  }));
test("invalid settings, unexpected fields and provider/host/environment changes without new keys are rejected without writes", () =>
  fixture(({ path, store }) => {
    store.saveIntegration(plaid);
    store.saveIntegration(ai);
    const before = readFileSync(path);
    for (const value of [0, 1, 60, "5", null, Infinity])
      invalid(() => store.saveSecurity({ idleMinutes: value }));
    invalid(() => store.saveSecurity({ idleMinutes: 5, userId: 99 }));
    for (const input of [
      { ...plaid, secret: "short" },
      { ...plaid, clientId: "example-other-client", secret: "" },
      { ...plaid, environment: "production", secret: "" },
      { ...plaid, environment: "trial" },
      { ...plaid, secret: "bad value with spaces" },
      { ...plaid, password: "example-password" },
      { kind: "payment" },
      {
        ...ai,
        provider: "openai",
        baseUrl: "https://api.openai.com/v1",
        apiKey: "",
      },
      { ...ai, model: "" },
      { ...ai, baseUrl: "https://evil.example.com" },
    ])
      invalid(() => store.saveIntegration(input));
    for (const baseUrl of [
      "http://api.example.com",
      "https://localhost/v1",
      "https://127.0.0.1/v1",
      "https://user:pass@api.example.com",
      "https://api.example.com?key=example",
      "https://api.example.com/#secret",
      "file:///secret",
      "https://[::1]",
      "https://service.local/v1",
      "https://api.example.com:8443",
    ])
      invalid(() =>
        store.saveIntegration({ ...ai, provider: "custom", baseUrl }),
      );
    invalid(() => store.removeIntegration({ kind: "ai", all: true }));
    assert.deepEqual(readFileSync(path), before);
    assert.equal(
      store.saveIntegration({
        ...ai,
        provider: "custom",
        baseUrl: "https://example.com/v1",
      }).ai.provider,
      "custom",
    );
  }));
test("wrong OS protector, unavailable credential storage, tampering and failed encryption never reset an existing configuration", () =>
  fixture(({ dir, path, store, p }) => {
    store.saveIntegration(plaid);
    const before = readFileSync(path);
    for (const other of [protector(), { ...p, available: () => false }])
      assert.throws(
        () => new SettingsStore(path, other).get(),
        (e) => e.code === "SETTINGS_UNAVAILABLE",
      );
    assert.throws(
      () =>
        new SettingsStore(path, {
          ...p,
          protect() {
            throw new Error("private diagnostic");
          },
        }).saveSecurity({ idleMinutes: 5 }),
      (e) =>
        e.code === "SETTINGS_UNAVAILABLE" &&
        !e.message.includes("private diagnostic"),
    );
    assert.deepEqual(readFileSync(path), before);
    assert.equal(
      readdirSync(dir).some((name) => name.includes("writing-")),
      false,
    );
    const corrupt = Buffer.from(before);
    corrupt[corrupt.length - 5] ^= 1;
    writeFileSync(path, corrupt);
    assert.throws(
      () => store.get(),
      (e) => e.code === "SETTINGS_UNAVAILABLE",
    );
    assert.throws(
      () => store.saveSecurity({ idleMinutes: 5 }),
      (e) => e.code === "SETTINGS_UNAVAILABLE",
    );
    assert.deepEqual(readFileSync(path), corrupt);
  }));
test("configuration paths reject hard links and oversized files rather than treating them as empty", () =>
  fixture(({ dir, path, store }) => {
    store.saveIntegration(plaid);
    const before = readFileSync(path),
      alias = resolve(dir, "alias");
    linkSync(path, alias);
    assert.throws(
      () => store.get(),
      (e) => e.code === "SETTINGS_UNAVAILABLE",
    );
    assert.throws(
      () => store.saveSecurity({ idleMinutes: 5 }),
      (e) => e.code === "SETTINGS_UNAVAILABLE",
    );
    assert.deepEqual(readFileSync(alias), before);
    unlinkSync(alias);
    writeFileSync(path, Buffer.alloc(33000));
    assert.throws(
      () => store.get(),
      (e) => e.code === "SETTINGS_UNAVAILABLE",
    );
    assert.equal(readFileSync(path).length, 33000);
  }));
