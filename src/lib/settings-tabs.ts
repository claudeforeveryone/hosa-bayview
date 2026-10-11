// The Settings tabs, in the order they show. "appearance" was "look" until the rename; old links with
// ?tab=look still open the same tab. `short` is the phone tab row's label, so all five fit from 360 px.
export const SETTINGS_TABS: readonly {
  id: "appearance" | "sound" | "app" | "account" | "events";
  label: string;
  short?: string;
}[] = [
  { id: "appearance", label: "Appearance" },
  { id: "sound", label: "Sound" },
  { id: "app", label: "Phone app", short: "Phone" },
  { id: "account", label: "Account" },
  { id: "events", label: "Events" },
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
