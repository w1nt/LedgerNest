import { spawn } from "node:child_process";
import { createInterface } from "node:readline/promises";
import { Writable } from "node:stream";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import electron from "electron";
const root = fileURLToPath(new URL("../", import.meta.url));
const [command, ...args] = process.argv.slice(2);
if (!["seed", "encrypt", "backup", "restore"].includes(command))
  throw new Error("Unknown storage command.");
if (
  (command === "backup" && args.length !== 1) ||
  (command === "restore" && args.length !== 2)
)
  throw new Error(
    "backup requires a new .lnbackup path; restore requires a backup path and NEW database path.",
  );
let password;
if (["backup", "restore"].includes(command)) {
  if (!process.stdin.isTTY)
    throw new Error(
      "Use an interactive terminal to enter the backup passphrase privately.",
    );
  const muted = new Writable({
    write(_chunk, _encoding, done) {
      done();
    },
  });
  const reader = createInterface({
    input: process.stdin,
    output: muted,
    terminal: true,
  });
  try {
    process.stdout.write(
      "Backup passphrase (12-256 characters, input hidden): ",
    );
    password = await reader.question("");
    process.stdout.write("\n");
    if (command === "backup") {
      process.stdout.write("Confirm passphrase: ");
      const confirm = await reader.question("");
      process.stdout.write("\n");
      if (password !== confirm) throw new Error("Passphrases do not match.");
    }
    if (password.length < 12 || password.length > 256)
      throw new Error("Passphrase must contain 12-256 characters.");
  } finally {
    reader.close();
  }
}
const env = { ...process.env };
delete env.ELECTRON_RUN_AS_NODE;
delete env.LEDGERNEST_E2E;
delete env.LEDGERNEST_TEST_PROFILE;
const child = spawn(
  electron,
  [".", `--ledgernest-storage=${command}`, ...args.map((p) => resolve(p))],
  { cwd: root, env, windowsHide: true, stdio: ["pipe", "inherit", "inherit"] },
);
child.stdin.end(password ? JSON.stringify({ password }) : "");
password = undefined;
child.on("error", () => {
  console.error("Unable to launch local storage tool.");
  process.exitCode = 1;
});
child.on("exit", (code) => {
  process.exitCode = code ?? 1;
});
