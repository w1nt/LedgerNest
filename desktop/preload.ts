import { contextBridge, ipcRenderer } from "electron";
import { channels } from "./boundary.ts";
import type { DesktopBridge } from "../shared/desktop.ts";
// One capability per operation. Never expose ipcRenderer, arbitrary invoke or event objects.
const bridge: DesktopBridge = {
  settings: () => ipcRenderer.invoke(channels.settings),
  saveSecurity: (value) => ipcRenderer.invoke(channels.saveSecurity, value),
  saveIntegration: (value) =>
    ipcRenderer.invoke(channels.saveIntegration, value),
  removeIntegration: (value) =>
    ipcRenderer.invoke(channels.removeIntegration, value),
  deviceStatus: () => ipcRenderer.invoke(channels.deviceStatus),
  unlock: (value) => ipcRenderer.invoke(channels.unlock, value),
  onLocked: (listener) => {
    const notify = () => listener();
    ipcRenderer.on("device:locked", notify);
    return () => ipcRenderer.removeListener("device:locked", notify);
  },
  currentUser: () => ipcRenderer.invoke(channels.currentUser),
  logout: () => ipcRenderer.invoke(channels.logout),
  billPage: (value) => ipcRenderer.invoke(channels.billPage, value),
  createBill: (value) => ipcRenderer.invoke(channels.createBill, value),
};
contextBridge.exposeInMainWorld("ledgernest", Object.freeze(bridge));
