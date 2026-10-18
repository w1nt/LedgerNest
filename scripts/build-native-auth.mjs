import { execFileSync } from "node:child_process";
import { resolve, join } from "node:path";
import { readdirSync, existsSync } from "node:fs";
export function buildNativeAuth() {
  const source = resolve("desktop/native"),
    output = resolve("desktop/dist");
  if (process.platform === "win32") {
    const os = process.env.SystemRoot || "C:/Windows";
    const framework = join(
      os,
      "Microsoft.NET",
      process.arch === "ia32" ? "Framework" : "Framework64",
      "v4.0.30319",
    );
    const gac = join(
      os,
      "Microsoft.NET",
      "assembly",
      "GAC_MSIL",
      "System.Runtime",
    );
    const folder = readdirSync(gac).find((name) =>
      name.startsWith("v4.0_4.0.0.0__"),
    );
    if (!folder || !existsSync(join(framework, "csc.exe")))
      throw new Error(
        "Windows native authentication requires the system .NET Framework 4.8 compiler.",
      );
    execFileSync(
      join(framework, "csc.exe"),
      [
        "/nologo",
        "/codepage:65001",
        "/target:exe",
        "/out:" + join(output, "ledgernest-auth.exe"),
        "/reference:" + join(framework, "System.Runtime.WindowsRuntime.dll"),
        "/reference:" + join(gac, folder, "System.Runtime.dll"),
        "/reference:" +
          join(os, "System32", "WinMetadata", "Windows.Foundation.winmd"),
        "/reference:" +
          join(os, "System32", "WinMetadata", "Windows.Security.winmd"),
        join(source, "windows-auth.cs"),
      ],
      { stdio: "pipe", windowsHide: true },
    );
    const thumbprint = process.env.LEDGERNEST_WINDOWS_SIGNING_THUMBPRINT;
    if (thumbprint) {
      if (!/^[a-f0-9]{40}$/iu.test(thumbprint))
        throw new Error(
          "Expected a SHA-1 certificate thumbprint, not a private key.",
        );
      // Use an existing trusted certificate; never install certificates or change OS trust policy.
      const script = `$ErrorActionPreference='Stop'
$certificate=Get-Item -LiteralPath ('Cert:\\CurrentUser\\My\\'+$env:LEDGERNEST_SIGN_CERT)
if (!$certificate.HasPrivateKey) { throw 'A signing certificate with a private key is required.' }
$result=Set-AuthenticodeSignature -LiteralPath $env:LEDGERNEST_SIGN_TARGET -Certificate $certificate -HashAlgorithm SHA256
if ($result.Status -ne 'Valid') { throw 'The signing certificate must already be trusted by this device.' }`;
      execFileSync(
        join(os, "System32", "WindowsPowerShell", "v1.0", "powershell.exe"),
        [
          "-NoLogo",
          "-NoProfile",
          "-NonInteractive",
          "-EncodedCommand",
          Buffer.from(script, "utf16le").toString("base64"),
        ],
        {
          stdio: "pipe",
          windowsHide: true,
          env: {
            ...process.env,
            LEDGERNEST_SIGN_CERT: thumbprint,
            LEDGERNEST_SIGN_TARGET: join(output, "ledgernest-auth.exe"),
          },
        },
      );
    }
  } else if (process.platform === "darwin") {
    execFileSync(
      "/usr/bin/xcrun",
      [
        "swiftc",
        "-O",
        join(source, "macos-auth.swift"),
        "-framework",
        "LocalAuthentication",
        "-o",
        join(output, "ledgernest-auth"),
      ],
      { stdio: "pipe" },
    );
  }
}
