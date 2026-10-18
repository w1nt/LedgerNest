import { safeStorage } from "electron";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
import type { KeyProtector } from "./key-store.ts";
const marker = Buffer.from("LNDPAPI1");
function dpapi(value: Buffer, decrypt: boolean) {
  // Direct CurrentUser DPAPI avoids dependence on Chromium's lazily persisted Local State key.
  // Secret input travels over stdin only: never argv, environment, temporary files or diagnostics.
  const script = `$ErrorActionPreference='Stop'
Add-Type -AssemblyName System.Security
$inputBytes=[Convert]::FromBase64String([Console]::In.ReadToEnd())
$entropy=[Text.Encoding]::UTF8.GetBytes('LedgerNest/database-key/v1')
$result=[Security.Cryptography.ProtectedData]::${decrypt ? "Unprotect" : "Protect"}($inputBytes,$entropy,[Security.Cryptography.DataProtectionScope]::CurrentUser)
[Console]::Out.Write([Convert]::ToBase64String($result))`;
  try {
    const output = execFileSync(
      join(
        process.env.SystemRoot || "C:\\Windows",
        "System32",
        "WindowsPowerShell",
        "v1.0",
        "powershell.exe",
      ),
      [
        "-NoLogo",
        "-NoProfile",
        "-NonInteractive",
        "-EncodedCommand",
        Buffer.from(script, "utf16le").toString("base64"),
      ],
      {
        input: value.toString("base64"),
        encoding: "utf8",
        windowsHide: true,
        stdio: ["pipe", "pipe", "pipe"],
      },
    );
    return Buffer.from(output.trim(), "base64");
  } catch {
    throw new Error(
      "Windows could not unlock the protected database key for this OS user.",
    );
  }
}
export const osProtector: KeyProtector = {
  available: () =>
    process.platform === "win32" ||
    (safeStorage.isEncryptionAvailable() &&
      (process.platform !== "linux" ||
        !["basic_text", "unknown"].includes(
          safeStorage.getSelectedStorageBackend(),
        ))),
  protect: (value) =>
    process.platform === "win32"
      ? Buffer.concat([marker, dpapi(Buffer.from(value, "utf8"), false)])
      : safeStorage.encryptString(value),
  unprotect: (value) => {
    if (process.platform !== "win32") return safeStorage.decryptString(value);
    if (!value.subarray(0, marker.length).equals(marker))
      throw new Error("Unsupported OS-protected key format.");
    const clear = dpapi(value.subarray(marker.length), true);
    try {
      return clear.toString("utf8");
    } finally {
      clear.fill(0);
    }
  },
};
