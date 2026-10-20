import { openSync, closeSync, readSync, statSync, createReadStream, writeSync, fsyncSync, unlinkSync, existsSync } from "node:fs";
import { createHash } from "node:crypto";
import { setTimeout as delay } from "node:timers/promises";
import type { CloudFile } from "../shared/cloud.ts";
import { restrictFiles } from "./permissions.ts";
import { AppError } from "./errors.ts";
import { cloudError, googleFetch, jsonResponse, type GoogleFetch } from "./google-oauth.ts";
const api = "https://www.googleapis.com/drive/v3/files", folderType = "application/vnd.google-apps.folder";
const fields = "id,name,size,md5Checksum,createdTime,mimeType,appProperties,parents,trashed";
const maxBackup = 512 * 1024 * 1024 + 116;
export function driveId(value: unknown): string {
  if (typeof value !== "string" || !/^[A-Za-z0-9_-]{1,200}$/u.test(value)) throw cloudError("remote");
  return value;
}
function quoted(value: string) { return "'" + value.replaceAll("\\", "\\\\").replaceAll("'", "\\'") + "'"; }
export function uploadURL(value: string) {
  const url = new URL(value);
  if (url.protocol !== "https:" || url.hostname !== "www.googleapis.com" || url.port || url.username || url.password || url.hash || url.pathname !== "/upload/drive/v3/files" || url.searchParams.get("uploadType") !== "resumable") throw cloudError("remote");
  return url.toString();
}
function statusError(status: number) { return cloudError(status === 401 ? "auth" : status === 403 || status === 507 ? "quota" : status === 429 || status >= 500 ? "network" : "remote"); }
async function md5(path: string) {
  const hash = createHash("md5"); for await (const chunk of createReadStream(path)) hash.update(chunk); return hash.digest("hex");
}
/** Fixed Google endpoints only. The renderer never receives tokens, URLs or upload session handles. */
export class GoogleDrive {
  private token: (force: boolean, signal: AbortSignal) => Promise<string>;
  private request: GoogleFetch;
  constructor(token: (force: boolean, signal: AbortSignal) => Promise<string>, request: GoogleFetch = googleFetch) { this.token = token; this.request = request; }
  private async call(url: string, init: RequestInit, signal: AbortSignal): Promise<Response> {
    for (let auth = 0; auth < 2; auth++) {
      const token = await this.token(auth === 1, signal);
      if (signal.aborted) throw cloudError("canceled");
      let response: Response;
      try { response = await this.request(url, { ...init, headers: { ...init.headers, Authorization: "Bearer " + token }, redirect: "error", signal: AbortSignal.any([signal, AbortSignal.timeout(60000)]) }); }
      catch { throw cloudError(signal.aborted ? "canceled" : "network"); }
      if (response.status !== 401 || auth) return response;
      await response.body?.cancel();
    }
    throw cloudError("auth");
  }
  private async json(url: string, init: RequestInit, signal: AbortSignal) {
    const response = await this.call(url, init, signal);
    if (!response.ok) { await response.body?.cancel(); throw statusError(response.status); }
    return jsonResponse(response);
  }
  async folder(name: string, signal: AbortSignal, existing: string | null): Promise<string> {
    if (existing) {
      const response = await this.call(api + "/" + driveId(existing) + "?fields=" + fields, {}, signal);
      if (response.status === 404) await response.body?.cancel();
      else {
        if (!response.ok) { await response.body?.cancel(); throw statusError(response.status); }
        const found = await jsonResponse(response);
        if (found.mimeType !== folderType || (found.appProperties as Record<string, unknown>)?.ledgernest !== "folder-v1") throw cloudError("remote");
        if (!found.trashed) return existing;
      }
    }
    const query = "trashed=false and mimeType=" + quoted(folderType) + " and name=" + quoted(name) + " and appProperties has { key='ledgernest' and value='folder-v1' }";
    const list = await this.json(api + "?" + new URLSearchParams({ q: query, fields: "files(id)", pageSize: "1", spaces: "drive" }), {}, signal);
    if (!Array.isArray(list.files)) throw cloudError("remote");
    if (list.files.length) return driveId((list.files[0] as Record<string, unknown>).id);
    const created = await this.json(api + "?fields=id", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name, mimeType: folderType, appProperties: { ledgernest: "folder-v1" } }) }, signal);
    return driveId(created.id);
  }
  async upload(path: string, name: string, folder: string, signal: AbortSignal, progress: (value: number) => void) {
    const size = statSync(path).size;
    if (size < 4212 || size > maxBackup) throw cloudError("remote");
    const digest = await md5(path);
    const session = await this.call("https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable&fields=" + fields, {
      method: "POST", headers: { "Content-Type": "application/json", "X-Upload-Content-Type": "application/octet-stream", "X-Upload-Content-Length": String(size) },
      body: JSON.stringify({ name, parents: [driveId(folder)], mimeType: "application/octet-stream", appProperties: { ledgernest: "backup-v1" } }),
    }, signal);
    if (!session.ok) { await session.body?.cancel(); throw statusError(session.status); }
    const location = session.headers.get("location"); await session.body?.cancel();
    if (!location) throw cloudError("remote"); const url = uploadURL(location);
    const fd = openSync(path, "r");
    let offset = 0, failures = 0, completed: Record<string, unknown> | undefined;
    const buffer = Buffer.alloc(8 * 1024 * 1024);
    try {
      while (!completed) {
        if (signal.aborted) throw cloudError("canceled");
        const length = readSync(fd, buffer, 0, Math.min(buffer.length, size - offset), offset);
        if (!length) throw cloudError("remote");
        let response: Response | undefined;
        try { response = await this.call(url, { method: "PUT", headers: { "Content-Type": "application/octet-stream", "Content-Length": String(length), "Content-Range": `bytes ${offset}-${offset + length - 1}/${size}` }, body: new Uint8Array(buffer.subarray(0, length)) }, signal); }
        catch (error) { if (signal.aborted || (error instanceof AppError && error.code !== "CLOUD_NETWORK")) throw error; }
        if (!response || response.status === 429 || response.status >= 500) {
          if (response) await response.body?.cancel();
          if (++failures > 3) throw cloudError("network");
          await delay(1000 * 2 ** (failures - 1), undefined, { signal }).catch(() => { throw cloudError("canceled"); });
          response = await this.call(url, { method: "PUT", headers: { "Content-Length": "0", "Content-Range": `bytes */${size}` } }, signal);
        }
        if (response.status === 200 || response.status === 201) { completed = await jsonResponse(response); break; }
        if (response.status !== 308) { await response.body?.cancel(); throw statusError(response.status); }
        const range = response.headers.get("range"); await response.body?.cancel();
        const match = range?.match(/^bytes=0-(\d+)$/u), next = match ? Number(match[1]) + 1 : 0;
        if (!Number.isSafeInteger(next) || next < offset || next > offset + length || next >= size) throw cloudError("remote");
        if (next === offset) { if (++failures > 3) throw cloudError("network"); }
        else { failures = 0; offset = next; progress(Math.floor(offset * 100 / size)); }
      }
      const id = driveId(completed.id);
      // Read back final metadata; a received chunk or an initiated session is not a successful backup.
      const verified = await this.json(api + "/" + id + "?fields=" + fields, {}, signal);
      if (String(verified.size) !== String(size) || verified.md5Checksum !== digest || verified.name !== name || verified.trashed || !Array.isArray(verified.parents) || !verified.parents.includes(folder) || (verified.appProperties as Record<string, unknown>)?.ledgernest !== "backup-v1") throw cloudError("remote");
      progress(100); return id;
    } finally { closeSync(fd); buffer.fill(0); }
  }
  async list(folder: string, signal: AbortSignal): Promise<CloudFile[]> {
    const query = quoted(driveId(folder)) + " in parents and trashed=false and appProperties has { key='ledgernest' and value='backup-v1' }";
    const value = await this.json(api + "?" + new URLSearchParams({ q: query, pageSize: "100", orderBy: "createdTime desc", fields: "files(" + fields + ")", spaces: "drive" }), {}, signal);
    if (!Array.isArray(value.files) || value.files.length > 100) throw cloudError("remote");
    return value.files.map(file => this.file(file as Record<string, unknown>));
  }
  private file(value: Record<string, unknown>): CloudFile {
    const size = Number(value.size);
    if (typeof value.name !== "string" || value.name.length > 300 || !value.name.endsWith(".lnbackup") || /[\u0000-\u001f\u007f\u202a-\u202e\u2066-\u2069]/u.test(value.name) || typeof value.createdTime !== "string" || !Number.isFinite(Date.parse(value.createdTime)) || !Number.isSafeInteger(size) || size < 4212 || size > maxBackup || value.mimeType !== "application/octet-stream" || value.trashed || (value.appProperties as Record<string, unknown>)?.ledgernest !== "backup-v1") throw cloudError("remote");
    return { id: driveId(value.id), name: value.name, createdTime: value.createdTime, size };
  }
  async download(id: string, folder: string, target: string, signal: AbortSignal) {
    const meta = await this.json(api + "/" + driveId(id) + "?fields=" + fields, {}, signal), file = this.file(meta);
    if (!Array.isArray(meta.parents) || !meta.parents.includes(folder) || typeof meta.md5Checksum !== "string") throw cloudError("remote");
    const response = await this.call(api + "/" + file.id + "?alt=media", {}, signal);
    if (!response.ok) { await response.body?.cancel(); throw statusError(response.status); }
    const reader = response.body?.getReader(); if (!reader) throw cloudError("remote");
    let fd: number | undefined, created = false, total = 0; const hash = createHash("md5");
    try {
      fd = openSync(target, "wx", 0o600); created = true; restrictFiles([target]);
      for (;;) {
        const { done, value } = await reader.read(); if (done) break;
        total += value.length; if (total > file.size || signal.aborted) throw cloudError(signal.aborted ? "canceled" : "remote");
        let offset = 0; while (offset < value.length) offset += writeSync(fd, value, offset, value.length - offset);
        hash.update(value);
      }
      if (total !== file.size || hash.digest("hex") !== meta.md5Checksum) throw cloudError("remote");
      fsyncSync(fd); closeSync(fd); fd = undefined;
      const check = openSync(target, "r"), magic = Buffer.alloc(8);
      try { readSync(check, magic, 0, 8, 0); if (!magic.equals(Buffer.from("LNBACK01"))) throw cloudError("remote"); } finally { closeSync(check); }
    } catch (error) {
      if (fd !== undefined) { closeSync(fd); fd = undefined; }
      if (created && existsSync(target)) unlinkSync(target);
      throw error;
    } finally { if (fd !== undefined) closeSync(fd); await reader.cancel().catch(() => {}); }
    return file;
  }
}
