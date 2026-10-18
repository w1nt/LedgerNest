import { build } from "esbuild";
import { copyFile, mkdir } from "node:fs/promises";
await mkdir("desktop/dist", { recursive: true });
for (const entry of ["main", "preload"]) {
  await build({
    entryPoints: [`desktop/${entry}.ts`],
    outfile: `desktop/dist/${entry}.cjs`,
    bundle: true,
    platform: "node",
    format: "cjs",
    target: "node24",
    external: ["electron", "better-sqlite3-multiple-ciphers"],
    sourcemap: false,
  });
}
await copyFile("database/schema.sql", "desktop/dist/schema.sql");
console.log("Electron main/preload and SQLite schema built.");
