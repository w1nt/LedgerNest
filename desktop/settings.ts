import {
  readFileSync,
  writeFileSync,
  lstatSync,
  renameSync,
  unlinkSync,
  existsSync,
} from "node:fs";
import { dirname } from "node:path";
import { randomUUID } from "node:crypto";
import type { KeyProtector } from "./key-store.ts";
import { privateDirectory, restrictFiles } from "./permissions.ts";
import { syncFile } from "./database.ts";
import { AppError } from "./errors.ts";
import { object } from "./validation.ts";
import { aiProviders } from "../shared/settings.ts";
import type {
  SettingsSnapshot,
  AIProvider,
  IdleMinutes,
  IntegrationKind,
} from "../shared/settings.ts";
interface StoredSettings {
  version: 1;
  idleMinutes: IdleMinutes;
  plaid: {
    environment: "sandbox" | "production";
    clientId: string;
    secret: string;
  };
  ai: { provider: AIProvider; baseUrl: string; model: string; apiKey: string };
}
const marker = Buffer.from("LNSET01\n");
const invalid = () =>
  new AppError(400, "Invalid settings configuration.", "SETTINGS_INVALID");
const blank = (): StoredSettings => ({
  version: 1,
  idleMinutes: 10,
  plaid: { environment: "sandbox", clientId: "", secret: "" },
  ai: {
    provider: "deepseek",
    baseUrl: aiProviders.deepseek.baseUrl,
    model: "",
    apiKey: "",
  },
});
/** Short credentials are fully hidden; prefix/suffix never overlap. */
export function maskCredential(value: string) {
  return value.length >= 12
    ? value.slice(0, 4) + "••••••••" + value.slice(-4)
    : value
      ? "••••••••"
      : null;
}
function credential(value: unknown, allowBlank = false): string {
  if (
    typeof value !== "string" ||
    (!value && !allowBlank) ||
    (value && !/^[\x21-\x7e]{12,1024}$/u.test(value))
  )
    throw invalid();
  return value;
}
function environment(value: unknown): "sandbox" | "production" {
  if (value !== "sandbox" && value !== "production") throw invalid();
  return value;
}
function provider(value: unknown): AIProvider {
  if (typeof value !== "string" || !Object.hasOwn(aiProviders, value))
    throw invalid();
  return value as AIProvider;
}
function endpoint(value: unknown, allowBlank = false) {
  if (allowBlank && value === "") return "";
  if (typeof value !== "string" || value.length > 300 || value !== value.trim())
    throw invalid();
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw invalid();
  }
  if (
    url.protocol !== "https:" ||
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    url.port ||
    !/^[a-z0-9.-]+$/iu.test(url.hostname) ||
    !url.hostname.includes(".") ||
    /(?:^|\.)(?:localhost|local|internal|invalid)$/iu.test(url.hostname) ||
    /^[0-9.]+$/u.test(url.hostname)
  )
    throw invalid();
  return value.replace(/\/$/u, "");
}
function model(value: unknown, allowBlank = false) {
  if (
    typeof value !== "string" ||
    (!value && !allowBlank) ||
    (value && !/^[A-Za-z0-9._:/-]{1,100}$/u.test(value))
  )
    throw invalid();
  return value;
}
function idle(value: unknown): IdleMinutes {
  if (![5, 10, 15, 30].includes(Number(value)) || typeof value !== "number")
    throw invalid();
  return value as IdleMinutes;
}
/** OS-encrypted per-vault configuration. No method returns an unmasked credential. */
export class SettingsStore {
  private readonly path: string;
  private readonly protector: KeyProtector;
  constructor(path: string, protector: KeyProtector) {
    this.path = path;
    this.protector = protector;
  }
  private checkFile() {
    const file = lstatSync(this.path);
    if (
      !file.isFile() ||
      file.isSymbolicLink() ||
      file.nlink !== 1 ||
      file.size > 32 * 1024
    )
      throw new Error("Unsafe configuration file.");
  }
  private read(): StoredSettings {
    try {
      try {
        this.checkFile();
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === "ENOENT") return blank();
        throw error;
      }
      if (!this.protector.available()) throw new Error();
      const data = readFileSync(this.path);
      if (!data.subarray(0, marker.length).equals(marker)) throw new Error();
      const value = object(
        JSON.parse(this.protector.unprotect(data.subarray(marker.length))),
        ["version", "idleMinutes", "plaid", "ai"],
      );
      if (value.version !== 1) throw new Error();
      const plaid = object(value.plaid, ["environment", "clientId", "secret"]),
        ai = object(value.ai, ["provider", "baseUrl", "model", "apiKey"]);
      const p = provider(ai.provider),
        baseUrl = endpoint(ai.baseUrl, true);
      if (p !== "custom" && baseUrl !== aiProviders[p].baseUrl)
        throw new Error();
      const result: StoredSettings = {
        version: 1,
        idleMinutes: idle(value.idleMinutes),
        plaid: {
          environment: environment(plaid.environment),
          clientId: credential(plaid.clientId, true),
          secret: credential(plaid.secret, true),
        },
        ai: {
          provider: p,
          baseUrl,
          model: model(ai.model, true),
          apiKey: credential(ai.apiKey, true),
        },
      };
      if (
        !!result.plaid.clientId !== !!result.plaid.secret ||
        (result.ai.apiKey && (!baseUrl || !result.ai.model))
      )
        throw new Error();
      return result;
    } catch {
      throw new AppError(
        503,
        "Local settings could not be opened. Existing configuration was not reset.",
        "SETTINGS_UNAVAILABLE",
      );
    }
  }
  private snapshot(value: StoredSettings): SettingsSnapshot {
    return {
      idleMinutes: value.idleMinutes,
      plaid: {
        environment: value.plaid.environment,
        clientId: maskCredential(value.plaid.clientId),
        secret: maskCredential(value.plaid.secret),
        configured: !!value.plaid.clientId && !!value.plaid.secret,
      },
      ai: {
        provider: value.ai.provider,
        baseUrl: value.ai.baseUrl,
        model: value.ai.model,
        apiKey: maskCredential(value.ai.apiKey),
        configured: !!value.ai.apiKey,
      },
    };
  }
  get() {
    return this.snapshot(this.read());
  }
  private write(value: StoredSettings) {
    if (!this.protector.available())
      throw new AppError(
        503,
        "System credential storage is unavailable.",
        "SETTINGS_UNAVAILABLE",
      );
    let stage: string | undefined;
    try {
      try {
        this.checkFile();
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
      }
      const encrypted = Buffer.concat([
        marker,
        this.protector.protect(JSON.stringify(value)),
      ]);
      if (encrypted.length > 32 * 1024) throw new Error();
      privateDirectory(dirname(this.path));
      stage = this.path + ".writing-" + randomUUID();
      writeFileSync(stage, encrypted, { flag: "wx", mode: 0o600 });
      restrictFiles([stage]);
      syncFile(stage);
      renameSync(stage, this.path);
      stage = undefined;
      restrictFiles([this.path]);
      return this.snapshot(value);
    } catch {
      throw new AppError(
        503,
        "Local settings could not be saved.",
        "SETTINGS_UNAVAILABLE",
      );
    } finally {
      if (stage && existsSync(stage)) unlinkSync(stage);
    }
  }
  saveSecurity(value: unknown) {
    const input = object(value, ["idleMinutes"]),
      settings = this.read();
    settings.idleMinutes = idle(input.idleMinutes);
    return this.write(settings);
  }
  saveIntegration(value: unknown) {
    const shape = object(value, [
        "kind",
        "environment",
        "clientId",
        "secret",
        "provider",
        "baseUrl",
        "model",
        "apiKey",
      ]),
      settings = this.read();
    if (shape.kind === "plaid") {
      const input = object(value, [
          "kind",
          "environment",
          "clientId",
          "secret",
        ]),
        env = environment(input.environment);
      const clientId = credential(input.clientId, true),
        secret = credential(input.secret, true);
      if (env !== settings.plaid.environment && !secret) throw invalid();
      if (
        clientId &&
        clientId !== settings.plaid.clientId &&
        settings.plaid.secret &&
        !secret
      )
        throw invalid();
      settings.plaid = {
        environment: env,
        clientId: clientId || settings.plaid.clientId,
        secret: secret || settings.plaid.secret,
      };
      if (!settings.plaid.clientId || !settings.plaid.secret) throw invalid();
    } else if (shape.kind === "ai") {
      const input = object(value, [
          "kind",
          "provider",
          "baseUrl",
          "model",
          "apiKey",
        ]),
        p = provider(input.provider),
        baseUrl = endpoint(input.baseUrl),
        key = credential(input.apiKey, true);
      if (p !== "custom" && baseUrl !== aiProviders[p].baseUrl) throw invalid();
      // Never forward an existing key to a different provider/host after a metadata edit.
      if (
        (p !== settings.ai.provider || baseUrl !== settings.ai.baseUrl) &&
        !key
      )
        throw invalid();
      settings.ai = {
        provider: p,
        baseUrl,
        model: model(input.model),
        apiKey: key || settings.ai.apiKey,
      };
      if (!settings.ai.apiKey) throw invalid();
    } else throw invalid();
    return this.write(settings);
  }
  removeIntegration(value: unknown) {
    const input = object(value, ["kind"]);
    if (input.kind !== "plaid" && input.kind !== "ai") throw invalid();
    const settings = this.read(),
      kind = input.kind as IntegrationKind;
    if (kind === "plaid") settings.plaid = blank().plaid;
    else settings.ai = blank().ai;
    return this.write(settings);
  }
}
