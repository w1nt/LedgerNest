import { spawn } from "node:child_process";
import electron from "electron";
import { fileURLToPath } from "node:url";
const root = fileURLToPath(new URL("../", import.meta.url));
const env = { ...process.env };
// Tooling shells can set this globally; the app must start as Electron, not plain Node.
delete env.ELECTRON_RUN_AS_NODE;
delete env.LEDGERNEST_E2E;
delete env.LEDGERNEST_TEST_PROFILE;
const child = spawn(electron, ["."], {
  cwd: root,
  env,
  stdio: "inherit",
  windowsHide: true,
});
child.on("error", () => {
  console.error("Could not launch Electron. Run npm ci and npm run build.");
  process.exitCode = 1;
});
child.on("exit", (code) => {
  process.exitCode = code ?? 1;
});
