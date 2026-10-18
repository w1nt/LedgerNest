/** Hidden native availability check. Never submits a verification request. */
import { resolve, isAbsolute } from "node:path";
import { runDesktop } from "../runtime.ts";
import { nativeAuthenticator } from "../device-auth.ts";
const profile = process.env.LEDGERNEST_TEST_PROFILE;
if (!profile || !isAbsolute(profile) || !process.env.LEDGERNEST_DB_PATH)
  throw new Error("Isolated test profile/database required.");
const root = resolve(__dirname, "../.."),
  directory = resolve(root, "desktop/dist");
runDesktop(nativeAuthenticator(directory), {
  root,
  directory,
  hidden: true,
  profile,
});
