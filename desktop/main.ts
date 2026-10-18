import {
  app,
  BrowserWindow,
  dialog,
  ipcMain,
  protocol,
  session,
} from "electron";
import { access, readFile } from "node:fs/promises";
import { resolve, extname, relative, isAbsolute } from "node:path";
import { openVault } from "./vault.ts";
import { osProtector } from "./os-protector.ts";
import { seedExample } from "./fixtures.ts";
import { createBackup, restoreBackup } from "./backup.ts";
import { readFileSync } from "node:fs";
import { LocalService } from "./service.ts";
import { AppError, reply } from "./errors.ts";
import { trustedURL, channels } from "./boundary.ts";
protocol.registerSchemesAsPrivileged([
  {
    scheme: "ledgernest",
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      corsEnabled: true,
    },
  },
]);
const root = resolve(__dirname, "../..");
const test = process.env.LEDGERNEST_E2E === "1" && !app.isPackaged;
if (test) {
  if (
    !process.env.LEDGERNEST_TEST_PROFILE ||
    !isAbsolute(process.env.LEDGERNEST_TEST_PROFILE) ||
    !process.env.LEDGERNEST_DB_PATH
  )
    throw new Error("Test profile and database required");
  app.setPath("userData", process.env.LEDGERNEST_TEST_PROFILE);
}
let vault: ReturnType<typeof openVault> | undefined;
const storageArg = process.argv.find((arg) =>
  arg.startsWith("--ledgernest-storage="),
);
const storageCommand = storageArg?.split("=")[1];
let window: BrowserWindow | undefined;
const lock = app.requestSingleInstanceLock();
if (!lock) {
  if (storageCommand) {
    console.error("Close LedgerNest before running storage tools.");
    app.exit(1);
  } else app.quit();
} else {
  app.on("second-instance", () => {
    if (window) {
      if (window.isMinimized()) window.restore();
      window.focus();
    }
  });
  app
    .whenReady()
    .then(async () => {
      const dbPath = process.env.LEDGERNEST_DB_PATH
        ? resolve(root, process.env.LEDGERNEST_DB_PATH)
        : app.isPackaged
          ? resolve(app.getPath("userData"), "data/ledgernest.sqlite")
          : resolve(root, "data/ledgernest.sqlite");
      // Schema guard runs before serving any renderer. Existing data is never replaced by fixtures.
      const schema = resolve(__dirname, "schema.sql");
      if (storageCommand === "restore") {
        const index = process.argv.indexOf(storageArg!);
        const [backup, target] = process.argv.slice(index + 1);
        const input = readFileSync(0, "utf8");
        if (input.length > 2048 || !backup || !target)
          throw new Error("Invalid restore request.");
        await restoreBackup(
          backup,
          target,
          JSON.parse(input).password,
          schema,
          osProtector,
        );
        console.log("Encrypted backup restored to the new database.");
        app.quit();
        return;
      }
      vault = openVault(dbPath, schema, osProtector);
      const store = vault.store;
      if (storageCommand) {
        if (storageCommand === "seed") console.log(await seedExample(store));
        else if (storageCommand === "encrypt")
          console.log(
            JSON.stringify({
              encrypted: true,
              migrated: vault.migrated,
              recoveryCreated: !!vault.recovery,
            }),
          );
        else if (storageCommand === "backup") {
          const target = process.argv[process.argv.indexOf(storageArg!) + 1],
            input = readFileSync(0, "utf8");
          if (!target || input.length > 2048)
            throw new Error("Invalid backup request.");
          await createBackup(store, target, JSON.parse(input).password);
          console.log("Passphrase-protected encrypted backup created.");
        } else throw new Error("Unknown storage operation.");
        vault.close();
        vault = undefined;
        app.quit();
        return;
      }
      const assets = resolve(root, "frontend/my-react-app/dist");
      await access(resolve(assets, "index.html"));
      await access(resolve(__dirname, "preload.cjs"));
      const routes = new Set([
        "/",
        "/login",
        "/register",
        "/home",
        "/home/homepage",
        "/home/bills",
        "/home/settings",
        "/create-bill",
      ]);
      const mime: Record<string, string> = {
        ".html": "text/html; charset=utf-8",
        ".js": "text/javascript; charset=utf-8",
        ".css": "text/css; charset=utf-8",
        ".svg": "image/svg+xml",
        ".png": "image/png",
        ".ico": "image/x-icon",
        ".woff2": "font/woff2",
      };
      protocol.handle("ledgernest", async (request) => {
        if (request.method !== "GET" || !trustedURL(request.url))
          return new Response(null, { status: 403 });
        let pathname: string;
        try {
          pathname = decodeURIComponent(new URL(request.url).pathname);
        } catch {
          return new Response(null, { status: 400 });
        }
        const resource = routes.has(pathname)
          ? "index.html"
          : pathname.slice(1);
        const file = resolve(assets, resource),
          rel = relative(assets, file);
        if (
          rel.startsWith("..") ||
          isAbsolute(rel) ||
          pathname.includes("\\") ||
          !(
            routes.has(pathname) ||
            /^\/assets\/[A-Za-z0-9_.-]+$/u.test(pathname) ||
            ["/favicon.svg", "/icons.svg", "/theme-init.js"].includes(pathname)
          )
        )
          return new Response(null, { status: 404 });
        try {
          const body = await readFile(file);
          return new Response(new Uint8Array(body), {
            headers: {
              "Content-Type": mime[extname(file)] || "application/octet-stream",
              "Cache-Control": "no-store",
              "X-Content-Type-Options": "nosniff",
              "Referrer-Policy": "no-referrer",
              "Content-Security-Policy":
                "default-src 'self'; script-src 'self'; script-src-attr 'none'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self'; connect-src 'none'; object-src 'none'; base-uri 'none'; form-action 'self'; frame-src 'none'; frame-ancestors 'none'; worker-src 'none'",
            },
          });
        } catch {
          return new Response(null, { status: 404 });
        }
      });
      session.defaultSession.setPermissionRequestHandler(
        (_web, _permission, callback) => callback(false),
      );
      session.defaultSession.setPermissionCheckHandler(() => false);
      session.defaultSession.on("will-download", (event) =>
        event.preventDefault(),
      );
      function createWindow() {
        const win = new BrowserWindow({
          width: 1280,
          height: 850,
          minWidth: 800,
          minHeight: 600,
          show: !test,
          autoHideMenuBar: true,
          webPreferences: {
            preload: resolve(__dirname, "preload.cjs"),
            nodeIntegration: false,
            contextIsolation: true,
            sandbox: true,
            webSecurity: true,
            webviewTag: false,
            devTools: !app.isPackaged,
          },
        });
        window = win;
        const service = new LocalService(store!);
        const operations = {
          login: (value: unknown) => service.login(value),
          register: (value: unknown) => service.register(value),
          currentUser: () => service.currentUser(),
          logout: () => service.logout(),
          billPage: (value: unknown) => service.billPage(value),
          createBill: (value: unknown) => service.createBill(value),
        };
        for (const key of Object.keys(channels) as (keyof typeof channels)[]) {
          ipcMain.removeHandler(channels[key]);
          ipcMain.handle(channels[key], (event, ...args: unknown[]) =>
            reply(() => {
              if (
                win.isDestroyed() ||
                event.sender !== win.webContents ||
                !event.senderFrame ||
                event.senderFrame !== win.webContents.mainFrame ||
                !trustedURL(event.senderFrame.url)
              )
                throw new AppError(403, "Untrusted caller.");
              const needsArgument = !["currentUser", "logout"].includes(key);
              if (args.length !== (needsArgument ? 1 : 0))
                throw new AppError(400, "Invalid arguments.");
              return operations[key](args[0]);
            }),
          );
        }
        win.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
        win.webContents.on("will-navigate", (event, url) => {
          if (!trustedURL(url)) event.preventDefault();
        });
        win.webContents.on("will-redirect", (event, url) => {
          if (!trustedURL(url)) event.preventDefault();
        });
        win.webContents.on("will-attach-webview", (event) =>
          event.preventDefault(),
        );
        win.on("closed", () => {
          service.logout();
          window = undefined;
        });
        void win.loadURL("ledgernest://app/");
      }
      createWindow();
      app.on("activate", () => {
        if (!BrowserWindow.getAllWindows().length) createWindow();
      });
    })
    .catch(() => {
      if (!test && !storageCommand)
        dialog.showErrorBox(
          "LedgerNest",
          "Unable to unlock local storage. Close other LedgerNest processes and check your OS key store, database key, schema and permissions. Restore an encrypted backup if the key is lost. Existing data has not been reset.",
        );
      // Deliberately omit internal paths, SQL and credentials from startup diagnostics.
      console.error("LedgerNest storage startup failed.");
      if (storageCommand)
        console.error(
          "Storage could not be unlocked or validated. No database was reset.",
        );
      try {
        vault?.close();
      } catch {}
      app.exit(1);
    });
  app.on("window-all-closed", () => {
    if (process.platform !== "darwin") app.quit();
  });
  app.on("will-quit", () => {
    try {
      vault?.close();
    } catch {
      console.error("Unable to close local storage cleanly.");
    }
  });
}
