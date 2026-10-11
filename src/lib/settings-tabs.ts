// The Settings tabs, in the order they show. "appearance" was "look" until the rename; old links with
// ?tab=look still open the same tab. `short` is the phone tab row's label; when the tabs don't fit, the row
// scrolls sideways. `more` is an optional second line on the desktop rail. The visible words stay part of the
// link's name either way. Notifications and the phone app were one tab until members found it confusing.
export const SETTINGS_TABS: readonly {
  id: "appearance" | "sound" | "notifications" | "app" | "account" | "events" | "help";
  label: string;
  short?: string;
  more?: string;
}[] = [
  { id: "appearance", label: "Appearance" },
  { id: "sound", label: "Sound" },
  { id: "notifications", label: "Notifications" },
  { id: "app", label: "Phone app", short: "Phone" },
  { id: "account", label: "Account" },
  { id: "events", label: "Events" },
  { id: "help", label: "Help" },
];

export type SettingsTab = (typeof SETTINGS_TABS)[number]["id"];

const ALIASES = new Map<string, SettingsTab>([["look", "appearance"]]);

// Anything unknown (or a repeated ?tab= param, which arrives as an array) opens the first tab.
export function resolveSettingsTab(value: unknown): SettingsTab {
  if (typeof value !== "string") return "appearance";
  const alias = ALIASES.get(value);
  if (alias) return alias;
  return SETTINGS_TABS.find((t) => t.id === value)?.id ?? "appearance";
}
