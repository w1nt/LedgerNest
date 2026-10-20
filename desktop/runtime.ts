import {
  app,
  BrowserWindow,
  dialog,
  ipcMain,
  protocol,
  session,
  powerMonitor,
  shell,
} from "electron";
import { access, readFile } from "node:fs/promises";
import { resolve, extname, relative, isAbsolute } from "node:path";
import { openVault } from "./vault.ts";
import { osProtector } from "./os-protector.ts";
import { seedExample } from "./fixtures.ts";
import { createBackup, restoreBackup } from "./backup.ts";
import { readFileSync } from "node:fs";
import { CloudSync, cloudDependencies, type CloudDependencies } from "./cloud.ts";
import { DataTools } from "./data-tools.ts";
import { DataLocation } from "./data-location.ts";
import { SettingsStore } from "./settings.ts";
import { DeviceSession } from "./device-session.ts";
import type { DeviceAuthenticator } from "./device-auth.ts";
import { userInfo } from "node:os";
import { object } from "./validation.ts";
import { AppError, reply } from "./errors.ts";
import { trustedURL, channels } from "./boundary.ts";
export function runDesktop(
  auth: DeviceAuthenticator,
  options: {
    root: string;
    directory: string;
    hidden?: boolean;
    profile?: string;
    systemIdleSeconds?: () => number;
    cloudDependencies?: (standard: CloudDependencies) => CloudDependencies;
  },
) {
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
  const root = options.root,
    directory = options.directory,
    test = !!options.hidden;
  if (options.profile) {
    if (!isAbsolute(options.profile))
      throw new Error("Absolute profile required.");
    app.setPath("userData", options.profile);
  }
  let deviceSession: DeviceSession | undefined;
  let dataTools: DataTools | undefined;
  let cloudSync: CloudSync | undefined;
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
        // Storage stays closed until verification; openVault validates the schema before exposing data.
        const schema = resolve(directory, "schema.sql");
        const location = new DataLocation(dbPath, osProtector);
        if (storageCommand) {
          if (
            !["seed", "encrypt", "backup", "restore"].includes(storageCommand)
          )
            throw new Error("Unknown storage operation.");
          const ownerWindow = new BrowserWindow({
            show: false,
            webPreferences: {
              nodeIntegration: false,
              contextIsolation: true,
              sandbox: true,
            },
          });
          const handle = ownerWindow.getNativeWindowHandle();
          const number =
            process.platform === "win32"
              ? (handle.length === 8
                  ? handle.readBigUInt64LE()
                  : BigInt(handle.readUInt32LE())
                ).toString()
              : "0";
          await auth.verify(number, "en-US", new AbortController().signal);
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
          } else {
            vault = openVault(location.activePath(), schema, osProtector);
            const store = vault.store;
            if (storageCommand === "seed")
              console.log(await seedExample(store));
            else if (storageCommand === "encrypt")
              console.log(
                JSON.stringify({
                  encrypted: true,
                  migrated: vault.migrated,
                  recoveryCreated: !!vault.recovery,
                }),
              );
            else {
              const target =
                  process.argv[process.argv.indexOf(storageArg!) + 1],
                input = readFileSync(0, "utf8");
              if (!target || input.length > 2048)
                throw new Error("Invalid backup request.");
              await createBackup(store, target, JSON.parse(input).password);
              console.log("Passphrase-protected encrypted backup created.");
            }
            vault.close();
            vault = undefined;
          }
          ownerWindow.destroy();
          app.quit();
          return;
        }
        const owner =
          userInfo()
            .username.replace(/[\u0000-\u001f\u007f-\u009f]/gu, "")
            .slice(0, 100) || "Local profile";
        const settings = new SettingsStore(dbPath + ".settings", osProtector);
        const device = new DeviceSession(
          auth,
          () => openVault(location.activePath(), schema, osProtector),
          owner,
          () => {
            dataTools?.cancel();
            cloudSync?.locked();
            if (window && !window.isDestroyed())
              window.webContents.send("device:locked");
          },
        );
        deviceSession = device;
        const lockDevice = () => {
          try {
            device.lock();
          } catch {
            console.error(
              "Local data was locked; storage close needs attention.",
            );
          }
        };
        powerMonitor.on("lock-screen", lockDevice);
        powerMonitor.on("suspend", lockDevice);
        powerMonitor.on("user-did-resign-active", lockDevice);
        const expiry = setInterval(() => {
          try {
            device.checkExpiry(
              options.systemIdleSeconds
                ? options.systemIdleSeconds()
                : powerMonitor.getSystemIdleTime(),
            );
          } catch {
            lockDevice();
          }
        }, 5000);
        expiry.unref();
        const cloudTimer = setInterval(() => { void cloudSync?.tick(); }, 60000);
        cloudTimer.unref();
        const assets = resolve(root, "frontend/my-react-app/dist");
        await access(resolve(assets, "index.html"));
        await access(resolve(directory, "preload.cjs"));
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
              ["/favicon.svg", "/icons.svg", "/theme-init.js"].includes(
                pathname,
              )
            )
          )
            return new Response(null, { status: 404 });
          try {
            const body = await readFile(file);
            return new Response(new Uint8Array(body), {
              headers: {
                "Content-Type":
                  mime[extname(file)] || "application/octet-stream",
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
              preload: resolve(directory, "preload.cjs"),
              nodeIntegration: false,
              contextIsolation: true,
              sandbox: true,
              webSecurity: true,
              webviewTag: false,
              devTools: !app.isPackaged,
            },
          });
          window = win;
          const handle = win.getNativeWindowHandle();
          const number = process.platform === "win32"
            ? (handle.length === 8 ? handle.readBigUInt64LE() : BigInt(handle.readUInt32LE())).toString()
            : "0";
          const tools = new DataTools(location, device, schema, osProtector, {
            directory: async () => {
              const result = await dialog.showOpenDialog(win, { properties: ["openDirectory", "createDirectory"] });
              return result.canceled ? undefined : result.filePaths[0];
            },
            save: async (extension, directory) => {
              const result = await dialog.showSaveDialog(win, {
                ...(directory ? { defaultPath: directory + "/" } : {}),
                filters: [{ name: extension.toUpperCase(), extensions: [extension] }],
                properties: ["createDirectory", "showOverwriteConfirmation", "dontAddToRecent"],
              });
              return result.canceled ? undefined : result.filePath;
            },
            open: async () => {
              const result = await dialog.showOpenDialog(win, { properties: ["openFile", "dontAddToRecent"], filters: [{ name: "LedgerNest", extensions: ["lnbackup"] }] });
              return result.canceled ? undefined : result.filePaths[0];
            },
            confirmRestore: async (records, locale) => {
              const zh = locale === "zh-CN";
              const result = await dialog.showMessageBox(win, {
                type: "warning",
                title: zh ? "恢复备份" : "Restore backup",
                message: zh ? `已验证备份包含 ${records} 条记录。切换到此备份？` : `Verified backup contains ${records} records. Switch to this backup?`,
                detail: zh ? "恢复采用替换当前数据的方式，不合并记录。当前数据库文件会保留在本机。恢复后需要重新解锁。API 配置不在备份中。" : "This replaces the active records without merging. Previous database files remain on this device. Unlock again after restoring. API configuration is not included.",
                buttons: zh ? ["取消", "恢复"] : ["Cancel", "Restore"],
                defaultId: 0, cancelId: 0, noLink: true,
              });
              return result.response === 1;
            },
          }, (locale, signal) => auth.verify(number, locale, signal));
          dataTools = tools;
          const standardCloud = cloudDependencies(async () => {
            const result = await dialog.showOpenDialog(win, { properties: ["openFile", "dontAddToRecent"], filters: [{ name: "Google Desktop OAuth JSON", extensions: ["json"] }] });
            return result.canceled ? undefined : result.filePaths[0];
          }, async () => {
            const result = await dialog.showSaveDialog(win, { filters: [{ name: "LedgerNest", extensions: ["lnbackup"] }], properties: ["createDirectory", "showOverwriteConfirmation", "dontAddToRecent"] });
            return result.canceled ? undefined : result.filePath;
          }, url => shell.openExternal(url));
          const cloud = new CloudSync(dbPath + ".cloud-settings", osProtector, device, tools, options.cloudDependencies ? options.cloudDependencies(standardCloud) : standardCloud);
          cloudSync = cloud;
          const operations = {
            cloudState: () => cloud.state(),
            cloudImport: () => cloud.importClient(),
            cloudConnect: () => cloud.connect(),
            cloudSave: (value: unknown) => cloud.save(value),
            cloudSync: () => cloud.sync(),
            cloudDisconnect: () => cloud.disconnect(),
            cloudList: () => cloud.list(),
            cloudDownload: (value: unknown) => cloud.download(value),
            cloudCancel: () => { device.requireService(); cloud.cancel(); return null; },
            backupLocation: () => tools.state(),
            chooseBackupDirectory: () => tools.chooseDirectory(),
            backupData: (value: unknown) => tools.backup(value),
            exportRecords: (value: unknown) => tools.export(value),
            restoreData: (value: unknown) => tools.restore(value),
            settings: () => {
              device.requireService();
              return settings.get();
            },
            saveSecurity: (value: unknown) => {
              device.requireService();
              const next = settings.saveSecurity(value);
              device.setIdleMinutes(next.idleMinutes);
              return next;
            },
            saveIntegration: (value: unknown) => {
              device.requireService();
              return settings.saveIntegration(value);
            },
            removeIntegration: (value: unknown) => {
              device.requireService();
              return settings.removeIntegration(value);
            },
            deviceStatus: () => device.status(),
            unlock: (value: unknown) => {
              if (tools.busy) throw new AppError(409, "Data operation in progress.", "DATA_BUSY");
              const input = object(value, ["locale"]);
              if (!["zh-CN", "en-US"].includes(String(input.locale)))
                throw new AppError(400, "Invalid locale.");
              const handle = win.getNativeWindowHandle();
              const number =
                process.platform === "win32"
                  ? (handle.length === 8
                      ? handle.readBigUInt64LE()
                      : BigInt(handle.readUInt32LE())
                    ).toString()
                  : "0";
              return device
                .unlock(number, input.locale as "zh-CN" | "en-US")
                .then((user) => {
                  // Corrupt settings never weaken the default ten-minute lock policy or get reset.
                  try {
                    device.setIdleMinutes(settings.get().idleMinutes);
                  } catch {
                    device.setIdleMinutes(10);
                  }
                  void cloud.tick();
                  return user;
                });
            },
            currentUser: () => device.currentUser(),
            logout: () => device.lock(),
            billPage: (value: unknown) =>
              device.requireService().billPage(value),
            createBill: (value: unknown) =>
              device.requireService().createBill(value),
          };
          for (const key of Object.keys(
            channels,
          ) as (keyof typeof channels)[]) {
            ipcMain.removeHandler(channels[key]);
            ipcMain.handle(channels[key], (event, ...args: unknown[]) =>
              reply<unknown>(() => {
                if (
                  win.isDestroyed() ||
                  event.sender !== win.webContents ||
                  !event.senderFrame ||
                  event.senderFrame !== win.webContents.mainFrame ||
                  !trustedURL(event.senderFrame.url)
                )
                  throw new AppError(403, "Untrusted caller.");
                const needsArgument = [
                  "unlock",
                  "cloudSave",
                  "cloudDownload",
                  "backupData",
                  "exportRecords",
                  "restoreData",
                  "saveSecurity",
                  "saveIntegration",
                  "removeIntegration",
                  "billPage",
                  "createBill",
                ].includes(key);
                if (args.length !== (needsArgument ? 1 : 0))
                  throw new AppError(400, "Invalid arguments.");
                return operations[key](args[0]);
              }),
            );
          }
          win.webContents.on("render-process-gone", lockDevice);
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
            lockDevice();
            window = undefined;
          });
          void win.loadURL("ledgernest://app/login");
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
          deviceSession?.lock();
          vault?.close();
        } catch {}
        app.exit(1);
      });
    app.on("window-all-closed", () => {
      if (process.platform !== "darwin") app.quit();
    });
    app.on("will-quit", () => {
      cloudSync?.stop();
      try {
        deviceSession?.lock();
        vault?.close();
      } catch {
        console.error("Unable to close local storage cleanly.");
      }
    });
  }
}
