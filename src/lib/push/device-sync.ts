// Keeping this browser's push row in step with the browser, on every signed-in page (PwaLayer). Pure: the hook
// reads the browser and passes the facts in.
//
// - The row follows the session: whoever is signed in owns this device's pushes, never the member before.
// - It carries the device's Notification sound setting (Settings > Sound), re-saved the moment that changes.
// - A subscription the server can no longer reach (made with an older key) or that the member blocked is dropped,
//   so Settings shows "off" and one tap sets it up again.

export type DeviceFacts = {
  userId: string;
  permission: NotificationPermission | "unsupported";
  subscription: { endpoint: string; sameKey: boolean } | null;
  sound: boolean;
  // The key of the last save this page load, so a save happens once, not on every appearance change.
  lastSaved: string | null;
};

export type DeviceSyncStep =
  { kind: "none" } | { kind: "save"; key: string } | { kind: "drop" };

export function deviceSyncStep(f: DeviceFacts): DeviceSyncStep {
  if (!f.subscription) return { kind: "none" };
  if (!f.subscription.sameKey || f.permission === "denied")
    return { kind: "drop" };
  if (f.permission !== "granted") return { kind: "none" };
  const key = `${f.userId}|${f.subscription.endpoint}|${f.sound ? "on" : "off"}`;
  return key === f.lastSaved ? { kind: "none" } : { kind: "save", key };
}
