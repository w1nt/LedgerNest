import { resolve } from "node:path";
import { runDesktop } from "./runtime.ts";
import { nativeAuthenticator } from "./device-auth.ts";
runDesktop(nativeAuthenticator(__dirname), {
  root: resolve(__dirname, "../.."),
  directory: __dirname,
});
