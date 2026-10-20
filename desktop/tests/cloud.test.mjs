import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync, readFileSync, readdirSync } from "node:fs";
import { randomBytes, createCipheriv, createDecipheriv, createHash } from "node:crypto";
import { resolve } from "node:path";
import { tmpdir } from "node:os";
import { authorizeGoogle, exchangeToken, DRIVE_SCOPE, cloudError } from "../google-oauth.ts";
import { GoogleDrive, uploadURL } from "../google-drive.ts";
import { CloudSync } from "../cloud.ts";
import { DeviceSession } from "../device-session.ts";
import { DataTools } from "../data-tools.ts";
import { DataLocation } from "../data-location.ts";
import { openVault } from "../vault.ts";
const client = { clientId: "example-desktop-client.apps.googleusercontent.com", clientSecret: "example-client-secret-1234" };
const password = "example-cloud-backup-passphrase", refreshToken = "example-refresh-token-1234", accessToken = "example-access-token-1234";
const tokens = { accessToken, refreshToken, expiresIn: 3600 }, schema = resolve("database/schema.sql");
const json = (value, status = 200) => new Response(JSON.stringify(value), { status, headers: { "Content-Type": "application/json" } });
test("desktop OAuth uses PKCE, exact state/loopback, limited scope, bounded callback lifetime and no token readback", async () => {
  let auth, redirect, verifier;
  const result = await authorizeGoogle(client, async url => {
    auth = new URL(url); redirect = auth.searchParams.get("redirect_uri");
    assert.equal(auth.origin, "https://accounts.google.com"); assert.equal(auth.searchParams.get("scope"), DRIVE_SCOPE);
    assert.equal(new URL(redirect).hostname, "127.0.0.1"); assert.equal(auth.searchParams.get("code_challenge_method"), "S256");
    assert.equal((await fetch(redirect + "?state=wrong&code=example")).status, 400);
    assert.equal((await fetch(redirect + "?state=" + encodeURIComponent("中".repeat(43)) + "&code=example")).status, 400);
    assert.equal((await fetch(redirect + "?" + new URLSearchParams({ state: auth.searchParams.get("state"), code: "example-authorization-code" }))).status, 200);
  }, AbortSignal.timeout(10000), async (url, init) => {
    assert.equal(url, "https://oauth2.googleapis.com/token"); assert.equal(init.redirect, "error");
    const body = new URLSearchParams(init.body); verifier = body.get("code_verifier");
    assert.equal(body.get("redirect_uri"), redirect); assert.equal(body.get("code"), "example-authorization-code");
    return json({ access_token: accessToken, refresh_token: refreshToken, expires_in: 3600, token_type: "Bearer", scope: DRIVE_SCOPE });
  });
  assert.equal(createHash("sha256").update(verifier).digest("base64url"), auth.searchParams.get("code_challenge"));
  assert.equal(result.refreshToken, refreshToken);
  await assert.rejects(fetch(redirect));
  const controller = new AbortController(); let canceledRedirect;
  await assert.rejects(authorizeGoogle(client, async url => { canceledRedirect = new URL(url).searchParams.get("redirect_uri"); controller.abort(); }, controller.signal), error => error.code === "CLOUD_CANCELED");
  await assert.rejects(fetch(canceledRedirect));
  await assert.rejects(exchangeToken(client, { grant_type: "refresh_token", refresh_token: refreshToken }, AbortSignal.timeout(1000), async () => json({ error: "invalid_grant", private: refreshToken }, 400)), error => error.code === "CLOUD_AUTH" && !error.message.includes(refreshToken));
});
test("Drive resumes interrupted chunks, verifies remote hash/size, confines upload URLs and validates downloads", async () => {
  const dir = mkdtempSync(resolve(tmpdir(), "ledgernest-drive-wire-"));
  try {
    const bytes = randomBytes(9 * 1024 * 1024); bytes.write("LNBACK01"); const source = resolve(dir, "example.lnbackup"); writeFileSync(source, bytes);
    const md5 = createHash("md5").update(bytes).digest("hex"), name = "example-test-snapshot.lnbackup";
    const meta = { id: "example_backup_001", name, size: String(bytes.length), md5Checksum: md5, createdTime: "2026-10-20T00:00:00.000Z", mimeType: "application/octet-stream", appProperties: { ledgernest: "backup-v1" }, parents: ["example_folder_001"], trashed: false };
    let received = 0, interrupted = false, queried = 0, refreshes = 0, corrupt = false;
    const request = async (url, init) => {
      assert.equal(new URL(url).origin, "https://www.googleapis.com"); assert.equal(init.redirect, "error"); assert.ok(init.headers.Authorization.startsWith("Bearer "));
      const u = new URL(url);
      if (u.pathname === "/upload/drive/v3/files" && init.method === "POST") return new Response(null, { status: 200, headers: { Location: "https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable&upload_id=example" } });
      if (u.pathname === "/upload/drive/v3/files" && init.method === "PUT") {
        const range = init.headers["Content-Range"];
        if (range.startsWith("bytes */")) { queried++; return new Response(null, { status: 308, headers: { Range: `bytes=0-${received - 1}` } }); }
        const start = Number(range.match(/^bytes (\d+)-/u)[1]); assert.equal(start, received);
        if (!interrupted) { interrupted = true; received = 4 * 1024 * 1024; throw new Error("simulated connection lost"); }
        assert.deepEqual(Buffer.from(init.body), bytes.subarray(start)); received = bytes.length; return json(meta);
      }
      if (u.pathname.endsWith("example_backup_001") && u.searchParams.get("alt") === "media") return new Response(bytes);
      if (u.pathname.endsWith("example_backup_001")) return json({ ...meta, md5Checksum: corrupt ? "0".repeat(32) : md5 });
      if (u.searchParams.has("q")) return json({ files: [meta] });
      throw new Error("Unexpected endpoint");
    };
    const drive = new GoogleDrive(async () => { refreshes++; return accessToken; }, request);
    const progress = [];
    await drive.upload(source, name, "example_folder_001", AbortSignal.timeout(10000), p => progress.push(p));
    assert.equal(queried, 1); assert.equal(received, bytes.length); assert.equal(progress.at(-1), 100); assert.ok(refreshes > 1);
    const history = await drive.list("example_folder_001", AbortSignal.timeout(1000)); assert.equal(history[0].name, name);
    const downloaded = resolve(dir, "downloaded.lnbackup");
    await drive.download(meta.id, "example_folder_001", downloaded, AbortSignal.timeout(1000)); assert.deepEqual(readFileSync(downloaded), bytes);
    await assert.rejects(drive.download(meta.id, "example_foreign_folder", resolve(dir, "wrong.lnbackup"), AbortSignal.timeout(1000)), e => e.code === "CLOUD_REMOTE");
    corrupt = true;
    await assert.rejects(drive.download(meta.id, "example_folder_001", resolve(dir, "corrupt.lnbackup"), AbortSignal.timeout(1000)), e => e.code === "CLOUD_REMOTE");
    assert.equal(readdirSync(dir).includes("corrupt.lnbackup"), false);
    for (const url of ["https://evil.invalid/upload/drive/v3/files?uploadType=resumable", "http://www.googleapis.com/upload/drive/v3/files?uploadType=resumable", "https://www.googleapis.com:443@evil.invalid/upload/drive/v3/files?uploadType=resumable", "https://www.googleapis.com/token?uploadType=resumable"]) assert.throws(() => uploadURL(url));
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
function protector() {
  const key = randomBytes(32);
  return { available: () => true, protect(value) { const iv = randomBytes(12), c = createCipheriv("aes-256-gcm", key, iv); const b = Buffer.concat([c.update(value, "utf8"), c.final()]); return Buffer.concat([iv, c.getAuthTag(), b]); }, unprotect(value) { const d = createDecipheriv("aes-256-gcm", key, value.subarray(0, 12)); d.setAuthTag(value.subarray(12, 28)); return Buffer.concat([d.update(value.subarray(28)), d.final()]).toString("utf8"); } };
}
async function fixture(action) {
  const dir = mkdtempSync(resolve(tmpdir(), "ledgernest-cloud-core-")), db = resolve(dir, "example.sqlite"), p = protector();
  let now = Date.parse("2026-10-20T00:00:00Z"), cloud, tools, count = 0, mode = "success", onUpload;
  const clock = () => now;
  const device = new DeviceSession({ status: async () => ({ platform: "windows", availability: "available" }), verify: async () => {} }, () => openVault(db, schema, p), "Example", () => { tools?.cancel(); cloud?.locked(); }, clock);
  tools = new DataTools(new DataLocation(db, p), device, schema, p, { directory: async () => undefined, save: async () => undefined, open: async () => undefined, confirmRestore: async () => true }, async () => {});
  const credentials = resolve(dir, "example-oauth.json"); writeFileSync(credentials, JSON.stringify({ installed: { client_id: client.clientId, client_secret: client.clientSecret, token_uri: "https://oauth2.googleapis.com/token" } }));
  const deps = { chooseClient: async () => credentials, chooseDownload: async () => undefined, authorize: async () => tokens, refresh: async () => ({ ...tokens, refreshToken: "example-rotated-refresh-token-9012" }), now: clock, drive: token => ({ folder: async () => "example_folder_001", upload: async (path, name, folder, signal, progress) => { await token(false, signal); count++; const bytes = readFileSync(path); assert.equal(bytes.subarray(0, 8).toString(), "LNBACK01"); assert.equal(bytes.includes(Buffer.from("device-auth-only")), false); if (onUpload) await onUpload(signal); if (signal.aborted) throw cloudError("canceled"); if (mode !== "success") throw cloudError(mode); progress(100); return "example_backup_001"; }, list: async () => [] }) };
  cloud = new CloudSync(db + ".cloud-settings", p, device, tools, deps);
  const config = { enabled: true, automatic: true, intervalHours: 24, folderName: "example-backups", filePrefix: "example", password, confirmation: password, rememberConfirmed: true };
  try { await action({ dir, db, cloud, device, tools, p, deps, config, count: () => count, time: ms => { now += ms; }, mode: value => { mode = value; }, onUpload: value => { onUpload = value; } }); }
  finally { cloud.stop(); device.lock(); rmSync(dir, { recursive: true, force: true }); }
}
test("optional daily scheduler persists, respects locking without touching idle, retries failures and never records a false success", () => fixture(async ({ dir, db, cloud, device, tools, p, deps, config, count, time, mode, onUpload }) => {
  assert.throws(() => cloud.state(), e => e.status === 401); await device.unlock("0", "en-US");
  assert.equal(cloud.state().enabled, false); assert.equal(cloud.state().intervalHours, 24); await cloud.tick(); assert.equal(count(), 0);
  await cloud.importClient(); await cloud.connect();
  assert.throws(() => cloud.save({ ...config, rememberConfirmed: false }), e => e.code === "CLOUD_CONFIG");
  cloud.save(config); assert.equal(cloud.state().automatic, true);
  for (const secret of [client.clientId, client.clientSecret, password, refreshToken]) assert.equal(readFileSync(db + ".cloud-settings").includes(Buffer.from(secret)), false);
  const snapshot = JSON.stringify(cloud.state()); for (const secret of [client.clientId, client.clientSecret, password, refreshToken, accessToken]) assert.equal(snapshot.includes(secret), false);
  await cloud.tick(); assert.equal(count(), 0);
  time(24 * 3600000); await cloud.tick(); assert.equal(count(), 0); // old session expired; never bypass unlock
  await device.unlock("0", "en-US"); await cloud.tick(); assert.equal(count(), 1);
  const success = cloud.state().lastSuccessAt; assert.ok(success);
  const privateConfig = JSON.parse(p.unprotect(readFileSync(db + ".cloud-settings").subarray(Buffer.byteLength("LNCLOUD01\n"))));
  assert.equal(privateConfig.refreshToken, "example-rotated-refresh-token-9012");
  const restarted = new CloudSync(db + ".cloud-settings", p, device, tools, deps); assert.equal(restarted.state().lastSuccessAt, success);
  cloud.save({ ...config, automatic: false, password: "", confirmation: "", rememberConfirmed: false });
  time(3600000); await device.unlock("0", "en-US").catch(() => {}); // expiry below is deliberately checked before re-unlock
  try { device.backgroundService(); } catch { await device.unlock("0", "en-US"); }
  await cloud.tick(); assert.equal(count(), 1);
  mode("network"); await assert.rejects(cloud.sync(), e => e.code === "CLOUD_NETWORK"); assert.equal(cloud.state().lastSuccessAt, success); assert.equal(cloud.state().lastError, "network");
  mode("success"); await cloud.sync(); assert.equal(cloud.state().lastError, null);
  onUpload(async () => device.lock()); await assert.rejects(cloud.sync(), e => e.code === "CLOUD_CANCELED"); assert.equal(readdirSync(dir).some(name => name.startsWith(".cloud-")), false);
  onUpload(undefined); await device.unlock("0", "en-US");
  const beforeIdle = cloud.state(); time(9 * 60000); cloud.state(); time(2 * 60000);
  assert.throws(() => cloud.state(), e => e.status === 401); // polling did not keep the session alive
  await device.unlock("0", "en-US"); mode("auth"); await assert.rejects(cloud.sync(), e => e.code === "CLOUD_AUTH"); assert.equal(cloud.state().enabled, false); assert.equal(cloud.state().automatic, false);
  const disconnected = cloud.disconnect(); assert.equal(disconnected.connected, false); assert.equal(disconnected.passwordSet, false); assert.ok(beforeIdle.lastSuccessAt);
}));
