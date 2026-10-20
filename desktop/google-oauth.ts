import { createServer } from "node:http";
import { randomBytes, createHash, timingSafeEqual } from "node:crypto";
import { AppError } from "./errors.ts";
export const DRIVE_SCOPE = "https://www.googleapis.com/auth/drive.file";
export interface OAuthClient { clientId: string; clientSecret: string }
export interface GoogleTokens { accessToken: string; refreshToken?: string; expiresIn: number }
export type GoogleFetch = (url: string, init: RequestInit) => Promise<Response>;
export const googleFetch: GoogleFetch = (url, init) => fetch(url, { ...init, redirect: "error" });
export function cloudError(code: "auth" | "network" | "quota" | "remote" | "config" | "canceled") {
  return new AppError(code === "auth" ? 409 : 503, "Cloud operation could not complete.", "CLOUD_" + code.toUpperCase());
}
export async function jsonResponse(response: Response) {
  const reader = response.body?.getReader();
  if (!reader) throw cloudError("remote");
  const chunks: Uint8Array[] = []; let size = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read(); if (done) break;
      size += value.length; if (size > 1024 * 1024) throw cloudError("remote"); chunks.push(value);
    }
    const result: unknown = JSON.parse(Buffer.concat(chunks).toString("utf8"));
    if (!result || typeof result !== "object" || Array.isArray(result)) throw cloudError("remote");
    return result as Record<string, unknown>;
  } catch { throw cloudError("remote"); }
  finally { await reader.cancel().catch(() => {}); }
}
export async function exchangeToken(client: OAuthClient, fields: Record<string, string>, signal: AbortSignal, request: GoogleFetch = googleFetch): Promise<GoogleTokens> {
  let response: Response;
  try {
    response = await request("https://oauth2.googleapis.com/token", {
      method: "POST", redirect: "error", signal: AbortSignal.any([signal, AbortSignal.timeout(60000)]),
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ client_id: client.clientId, client_secret: client.clientSecret, ...fields }).toString(),
    });
  } catch { throw cloudError(signal.aborted ? "canceled" : "network"); }
  if (!response.ok) { await response.body?.cancel(); throw cloudError(response.status >= 500 || response.status === 429 ? "network" : "auth"); }
  const value = await jsonResponse(response);
  if (typeof value.access_token !== "string" || !/^[\x21-\x7e]{12,8192}$/u.test(value.access_token) || value.token_type !== "Bearer" || typeof value.expires_in !== "number" || value.expires_in < 1 || value.expires_in > 86400 || (value.refresh_token !== undefined && (typeof value.refresh_token !== "string" || !/^[\x21-\x7e]{12,8192}$/u.test(value.refresh_token))) || (value.scope !== undefined && (typeof value.scope !== "string" || !value.scope.split(" ").includes(DRIVE_SCOPE)))) throw cloudError("auth");
  return { accessToken: value.access_token, expiresIn: value.expires_in, ...(value.refresh_token ? { refreshToken: String(value.refresh_token) } : {}) };
}
/** System browser + PKCE S256 + state + ephemeral IPv4 loopback. No embedded Google login. */
export async function authorizeGoogle(client: OAuthClient, openBrowser: (url: string) => Promise<void>, signal: AbortSignal, request: GoogleFetch = googleFetch): Promise<GoogleTokens> {
  const verifier = randomBytes(32).toString("base64url"), state = randomBytes(32).toString("base64url");
  let complete: ((code: string) => void) | undefined, fail: ((error: Error) => void) | undefined;
  const result = new Promise<string>((resolve, reject) => { complete = resolve; fail = reject; });
  // Attach immediately: browser opening may fail before the callback promise is awaited.
  void result.catch(() => {});
  let host = "";
  const server = createServer({ maxHeaderSize: 8192 }, (req, res) => {
    res.setHeader("Cache-Control", "no-store"); res.setHeader("Content-Security-Policy", "default-src 'none'");
    res.setHeader("Referrer-Policy", "no-referrer"); res.setHeader("Content-Type", "text/plain; charset=utf-8");
    let url: URL;
    try { url = new URL(req.url || "", "http://" + host); } catch { res.writeHead(400).end(); return; }
    const received = url.searchParams.get("state") || "";
    if (req.method !== "GET" || req.headers.host !== host || url.origin !== "http://" + host || url.pathname !== "/oauth2callback" || url.searchParams.getAll("state").length !== 1 || !/^[A-Za-z0-9_-]{43}$/u.test(received) || !timingSafeEqual(Buffer.from(received), Buffer.from(state))) { res.writeHead(400).end("Invalid authorization callback."); return; }
    const code = url.searchParams.get("code");
    if (url.searchParams.has("error")) { res.end("Authorization canceled. Return to LedgerNest."); fail?.(cloudError("auth")); return; }
    if (!code || code.length > 4096 || url.searchParams.getAll("code").length !== 1) { res.writeHead(400).end(); return; }
    res.end("Authorization received. Close this tab and return to LedgerNest."); complete?.(code);
  });
  server.on("clientError", (_error, socket) => socket.destroy());
  const cancel = () => fail?.(cloudError("canceled"));
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    if (signal.aborted) throw cloudError("canceled");
    await new Promise<void>((resolve, reject) => { server.once("error", reject); server.listen(0, "127.0.0.1", () => { server.removeListener("error", reject); resolve(); }); });
    const address = server.address(); if (!address || typeof address === "string") throw cloudError("network");
    host = "127.0.0.1:" + address.port;
    const redirect = "http://" + host + "/oauth2callback";
    const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
    url.search = new URLSearchParams({ client_id: client.clientId, redirect_uri: redirect, response_type: "code", scope: DRIVE_SCOPE, state, code_challenge: createHash("sha256").update(verifier).digest("base64url"), code_challenge_method: "S256", access_type: "offline", prompt: "consent select_account" }).toString();
    signal.addEventListener("abort", cancel, { once: true });
    timer = setTimeout(() => fail?.(cloudError("canceled")), 180000); timer.unref();
    if (signal.aborted) throw cloudError("canceled");
    await openBrowser(url.toString());
    const code = await result;
    if (signal.aborted) throw cloudError("canceled");
    return await exchangeToken(client, { code, code_verifier: verifier, redirect_uri: redirect, grant_type: "authorization_code" }, signal, request);
  } finally {
    if (timer) clearTimeout(timer); signal.removeEventListener("abort", cancel);
    server.close(); server.closeAllConnections();
  }
}
