import { contextBridge, ipcRenderer } from "electron";
import { channels } from "./boundary.ts";
import type { DesktopBridge } from "../shared/desktop.ts";
// One capability per operation. Never expose ipcRenderer, arbitrary invoke or event objects.
const bridge: DesktopBridge = {
  cloudState: () => ipcRenderer.invoke(channels.cloudState),
  cloudImport: () => ipcRenderer.invoke(channels.cloudImport),
  cloudConnect: () => ipcRenderer.invoke(channels.cloudConnect),
  cloudSave: value => ipcRenderer.invoke(channels.cloudSave, value),
  cloudSync: () => ipcRenderer.invoke(channels.cloudSync),
  cloudDisconnect: () => ipcRenderer.invoke(channels.cloudDisconnect),
  cloudList: () => ipcRenderer.invoke(channels.cloudList),
  cloudDownload: value => ipcRenderer.invoke(channels.cloudDownload, value),
  cloudCancel: () => ipcRenderer.invoke(channels.cloudCancel),
  backupLocation: () => ipcRenderer.invoke(channels.backupLocation),
  chooseBackupDirectory: () => ipcRenderer.invoke(channels.chooseBackupDirectory),
  backupData: value => ipcRenderer.invoke(channels.backupData, value),
  exportRecords: value => ipcRenderer.invoke(channels.exportRecords, value),
  restoreData: value => ipcRenderer.invoke(channels.restoreData, value),
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
