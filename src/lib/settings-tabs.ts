// The Settings tabs, in the order they show. "appearance" was "look" until the rename; old links with
// ?tab=look still open the same tab.
export const SETTINGS_TABS = [
  { id: "appearance", label: "Appearance" },
  { id: "sound", label: "Sound" },
  { id: "account", label: "Account" },
  { id: "events", label: "Events" },
] as const;

export type SettingsTab = (typeof SETTINGS_TABS)[number]["id"];

const ALIASES = new Map<string, SettingsTab>([["look", "appearance"]]);

// Anything unknown (or a repeated ?tab= param, which arrives as an array) opens the first tab.
export function resolveSettingsTab(value: unknown): SettingsTab {
  if (typeof value !== "string") return "appearance";
  const alias = ALIASES.get(value);
  if (alias) return alias;
  return SETTINGS_TABS.find((t) => t.id === value)?.id ?? "appearance";
}
