import { build } from "esbuild";
import { copyFile, mkdir } from "node:fs/promises";
const directory = ".local-tools/device-auth-tests";
await mkdir(directory, { recursive: true });
await build({
  entryPoints: ["desktop/tests/app-entry.ts"],
  outfile: directory + "/main.cjs",
  bundle: true,
  platform: "node",
  format: "cjs",
  target: "node24",
  external: ["electron", "better-sqlite3-multiple-ciphers"],
  sourcemap: false,
});
await build({
  entryPoints: ["desktop/tests/native-entry.ts"],
  outfile: directory + "/native.cjs",
  bundle: true,
  platform: "node",
  format: "cjs",
  target: "node24",
  external: ["electron", "better-sqlite3-multiple-ciphers"],
  sourcemap: false,
});
await copyFile("desktop/dist/preload.cjs", directory + "/preload.cjs");
await copyFile("database/schema.sql", directory + "/schema.sql");
