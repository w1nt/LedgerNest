import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { Store } from "../desktop/database.ts";
import { seedExample } from "../desktop/fixtures.ts";
const root = fileURLToPath(new URL("../", import.meta.url));
const store = new Store(
  resolve(root, process.env.LEDGERNEST_DB_PATH || "data/ledgernest.sqlite"),
  resolve(root, "database/schema.sql"),
);
try {
  console.log(await seedExample(store));
} catch {
  console.error(
    "Synthetic seed failed. Existing account passwords and data were not reset.",
  );
  process.exitCode = 1;
} finally {
  store.close();
}
