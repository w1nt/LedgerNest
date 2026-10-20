/** Isolated test transport: never imported by the production entry. */
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import type { CloudDependencies } from "../cloud.ts";
import { GoogleDrive } from "../google-drive.ts";
export function cloudFixture(standard: CloudDependencies): CloudDependencies {
  let now = Date.parse("2026-10-20T00:00:00Z"), uploads = 0;
  let content = Buffer.alloc(0), metadata: Record<string, unknown> = {};
  const testing = globalThis as typeof globalThis & { cloudTest?: { uploads: () => number; advance(hours: number): void; fail: boolean; pause: boolean; release?: () => void } };
  testing.cloudTest = { uploads: () => uploads, advance: hours => { now += hours * 3600000; }, fail: false, pause: false };
  const fake = async (url: string, init: RequestInit): Promise<Response> => {
    const u = new URL(url), controls = testing.cloudTest!;
    if (controls.fail) return new Response("", { status: 503 });
    const json = (value: unknown) => new Response(JSON.stringify(value), { status: 200 });
    if (u.pathname === "/upload/drive/v3/files" && init.method === "POST") {
      metadata = JSON.parse(String(init.body));
      return new Response(null, { status: 200, headers: { Location: "https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable&upload_id=example" } });
    }
    if (u.pathname === "/upload/drive/v3/files" && init.method === "PUT") {
      if (controls.pause) await new Promise<void>((resolve, reject) => {
        controls.release = resolve;
        init.signal?.addEventListener("abort", () => reject(new Error("canceled")), { once: true });
      });
      if (init.signal?.aborted) throw new Error("canceled");
      content = Buffer.from(init.body as Uint8Array); uploads++;
      metadata = { ...metadata, id: "example_backup_001", createdTime: new Date(now).toISOString(), size: String(content.length), md5Checksum: createHash("md5").update(content).digest("hex"), trashed: false };
      return json(metadata);
    }
    if (u.pathname.endsWith("example_folder_001")) return json({ id: "example_folder_001", mimeType: "application/vnd.google-apps.folder", appProperties: { ledgernest: "folder-v1" }, trashed: false });
    if (u.pathname.endsWith("example_backup_001") && u.searchParams.get("alt") === "media") return new Response(new Uint8Array(content));
    if (u.pathname.endsWith("example_backup_001")) return json(metadata);
    if (u.searchParams.has("q")) return json({ files: String(u.searchParams.get("q")).includes("folder-v1") ? [] : uploads ? [metadata] : [] });
    if (init.method === "POST") return json({ id: "example_folder_001" });
    throw new Error("Unexpected fixture endpoint");
  };
  const clientPath = process.env.LEDGERNEST_TEST_CLOUD_CLIENT;
  if (!clientPath || !readFileSync(clientPath).length) throw new Error("Fixture client required.");
  return { ...standard, chooseClient: async () => clientPath,
    authorize: async () => ({ accessToken: "example-access-token-1234", refreshToken: "example-refresh-token-5678", expiresIn: 3600 }),
    refresh: async () => ({ accessToken: "example-refreshed-token-1234", refreshToken: "example-refresh-token-5678", expiresIn: 3600 }),
    drive: token => new GoogleDrive(token, fake), now: () => now };
}
