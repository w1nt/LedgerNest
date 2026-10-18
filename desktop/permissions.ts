import { chmodSync, existsSync, lstatSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
export function privateDirectory(path: string) {
  if (!existsSync(path)) {
    mkdirSync(path, { recursive: true, mode: 0o700 });
    restrictFiles([path]);
  }
}
/** Replace the DACL, rather than retaining an explicit Everyone grant. Paths are data, never shell source. */
export function restrictFiles(paths: string[]) {
  const present = paths.filter((path) => existsSync(path));
  for (const path of present) {
    const s = lstatSync(path);
    if (s.isSymbolicLink() || (!s.isFile() && !s.isDirectory()))
      throw new Error("Unsafe storage path.");
  }
  if (!present.length) return;
  if (process.platform !== "win32") {
    for (const path of present)
      chmodSync(path, lstatSync(path).isDirectory() ? 0o700 : 0o600);
    return;
  }
  const script = `$ErrorActionPreference='Stop'
$sid=[System.Security.Principal.WindowsIdentity]::GetCurrent().User
foreach($p in (ConvertFrom-Json $env:LEDGERNEST_ACL_PATHS)) {
  $item=Get-Item -LiteralPath $p -Force
  if($item.PSIsContainer) {
    $acl=New-Object System.Security.AccessControl.DirectorySecurity
    $rule=New-Object System.Security.AccessControl.FileSystemAccessRule($sid,'FullControl','ContainerInherit,ObjectInherit','None','Allow')
  } else {
    $acl=New-Object System.Security.AccessControl.FileSecurity
    $rule=New-Object System.Security.AccessControl.FileSystemAccessRule($sid,'FullControl','Allow')
  }
  $acl.SetAccessRuleProtection($true,$false)
  $acl.AddAccessRule($rule)
  if($item.PSIsContainer) {[System.IO.Directory]::SetAccessControl($p,$acl)} else {[System.IO.File]::SetAccessControl($p,$acl)}
}`;
  execFileSync(
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
      windowsHide: true,
      stdio: "pipe",
      env: { ...process.env, LEDGERNEST_ACL_PATHS: JSON.stringify(present) },
    },
  );
}
