import { execFile } from "node:child_process";
import { join } from "node:path";
import { AppError } from "./errors.ts";
import type { DeviceStatus } from "../shared/desktop.ts";
export interface DeviceAuthenticator {
  status(): Promise<DeviceStatus>;
  verify(
    windowHandle: string,
    locale: "zh-CN" | "en-US",
    signal: AbortSignal,
  ): Promise<void>;
}
export function nativeAuthenticator(directory: string): DeviceAuthenticator {
  const platform =
    process.platform === "win32"
      ? "windows"
      : process.platform === "darwin"
        ? "macos"
        : "unsupported";
  const binary = join(
    directory,
    process.platform === "win32" ? "ledgernest-auth.exe" : "ledgernest-auth",
  );
  function run(args: string[], signal?: AbortSignal): Promise<string> {
    return new Promise((resolve, reject) =>
      execFile(
        binary,
        args,
        { windowsHide: true, timeout: 120000, maxBuffer: 4096, signal },
        (error, stdout) => {
          if (signal?.aborted) {
            reject(
              new AppError(
                409,
                "Device authentication canceled.",
                "AUTH_CANCELED",
              ),
            );
            return;
          }
          if (error) {
            reject(
              new AppError(
                503,
                "Device authentication is unavailable.",
                "AUTH_UNAVAILABLE",
              ),
            );
            return;
          }
          try {
            const value = JSON.parse(stdout);
            if (
              ![
                "available",
                "not_configured",
                "disabled",
                "busy",
                "unavailable",
                "verified",
                "canceled",
                "denied",
              ].includes(value.result)
            )
              throw new Error();
            resolve(value.result);
          } catch {
            reject(
              new AppError(
                503,
                "Device authentication is unavailable.",
                "AUTH_UNAVAILABLE",
              ),
            );
          }
        },
      ),
    );
  }
  return {
    async status() {
      if (platform === "unsupported")
        return { platform, availability: "unsupported" };
      try {
        const result = await run(["status"]);
        return {
          platform,
          availability: [
            "available",
            "not_configured",
            "disabled",
            "busy",
          ].includes(result)
            ? (result as DeviceStatus["availability"])
            : "unavailable",
        };
      } catch {
        return { platform, availability: "unavailable" };
      }
    },
    async verify(handle, locale, signal) {
      if (platform === "unsupported")
        throw new AppError(
          503,
          "This platform does not support device unlock.",
          "AUTH_UNAVAILABLE",
        );
      const status = await this.status();
      if (status.availability !== "available")
        throw new AppError(
          409,
          "Configure system device authentication first.",
          status.availability === "not_configured"
            ? "AUTH_NOT_CONFIGURED"
            : "AUTH_UNAVAILABLE",
        );
      const result = await run(["verify", handle, locale], signal);
      if (result !== "verified")
        throw new AppError(
          409,
          "Device authentication did not complete.",
          result === "canceled"
            ? "AUTH_CANCELED"
            : result === "denied"
              ? "AUTH_DENIED"
              : "AUTH_UNAVAILABLE",
        );
    },
  };
}
