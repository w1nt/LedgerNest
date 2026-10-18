import { contextBridge, ipcRenderer } from "electron";
import { channels } from "./boundary.ts";
import type { DesktopBridge } from "../shared/desktop.ts";
// One capability per operation. Never expose ipcRenderer, arbitrary invoke or event objects.
const bridge: DesktopBridge = {
  login: (value) => ipcRenderer.invoke(channels.login, value),
  register: (value) => ipcRenderer.invoke(channels.register, value),
  currentUser: () => ipcRenderer.invoke(channels.currentUser),
  logout: () => ipcRenderer.invoke(channels.logout),
  billPage: (value) => ipcRenderer.invoke(channels.billPage, value),
  createBill: (value) => ipcRenderer.invoke(channels.createBill, value),
};
contextBridge.exposeInMainWorld("ledgernest", Object.freeze(bridge));
