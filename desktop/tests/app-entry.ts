/** Isolated test executable. Not bundled into the production main/preload. */
import { resolve, isAbsolute } from "node:path";
import { cloudFixture } from "./cloud-fixture.ts";
import { runDesktop } from "../runtime.ts";
import { AppError } from "../errors.ts";
import type { DeviceAuthenticator } from "../device-auth.ts";
const profile = process.env.LEDGERNEST_TEST_PROFILE;
if (!profile || !isAbsolute(profile) || !process.env.LEDGERNEST_DB_PATH)
  throw new Error("Isolated test profile/database required.");
let attempts = 0;
const auth: DeviceAuthenticator = {
  async status() {
    return { platform: "windows", availability: "available" };
  },
  async verify() {
    attempts++;
    if (process.env.LEDGERNEST_TEST_AUTH_FIRST_CANCEL === "1" && attempts === 1)
      throw new AppError(
        409,
        "Canceled fixture verification.",
        "AUTH_CANCELED",
      );
  },
};
runDesktop(auth, {
  root: resolve(__dirname, "../.."),
  directory: __dirname,
  hidden: true,
  profile,
  systemIdleSeconds: () => 0,
  ...(process.env.LEDGERNEST_TEST_CLOUD_CLIENT ? { cloudDependencies: cloudFixture } : {}),
});
