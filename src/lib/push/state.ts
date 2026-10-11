// What the Settings switch shows for this device. Pure: the component reads the browser and passes the facts in.

export type PushFacts = {
  configured: boolean;
  // A phone on iOS that is not running the Home Screen app: web push does not exist there yet.
  iosNeedsHomeScreen: boolean;
  supported: boolean;
  permission: NotificationPermission | "unsupported";
  subscribed: boolean;
};

export type PushUiState =
  | "unavailable"
  | "needs-home-screen"
  | "unsupported"
  | "blocked"
  | "on"
  | "off";

export function pushUiState(f: PushFacts): PushUiState {
  if (!f.configured) return "unavailable";
  if (f.iosNeedsHomeScreen) return "needs-home-screen";
  if (!f.supported) return "unsupported";
  if (f.permission === "denied") return "blocked";
  return f.subscribed && f.permission === "granted" ? "on" : "off";
}
