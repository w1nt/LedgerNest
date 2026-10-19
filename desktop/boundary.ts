/** Shared by sender checks and navigation checks; custom schemes have opaque URL.origin. */
export function trustedURL(value: string) {
  try {
    const u = new URL(value);
    return (
      u.protocol === "ledgernest:" &&
      u.hostname === "app" &&
      !u.port &&
      !u.username &&
      !u.password
    );
  } catch {
    return false;
  }
}
export const channels = Object.freeze({
  settings: "settings:get",
  saveSecurity: "settings:security",
  saveIntegration: "settings:integration",
  removeIntegration: "settings:remove",
  deviceStatus: "device:status",
  unlock: "device:unlock",
  currentUser: "account:current",
  logout: "account:logout",
  billPage: "bills:page",
  createBill: "bills:create",
});
