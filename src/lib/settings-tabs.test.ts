import { describe, expect, it } from "vitest";
import { SETTINGS_TABS, resolveSettingsTab } from "./settings-tabs";

describe("resolveSettingsTab", () => {
  it("opens each tab by its id", () => {
    for (const t of SETTINGS_TABS) expect(resolveSettingsTab(t.id)).toBe(t.id);
  });

  it("still opens the Appearance tab for the old ?tab=look links", () => {
    expect(resolveSettingsTab("look")).toBe("appearance");
  });

  it("falls back to Appearance for anything unknown or missing", () => {
    expect(resolveSettingsTab(undefined)).toBe("appearance");
    expect(resolveSettingsTab("")).toBe("appearance");
    expect(resolveSettingsTab("nope")).toBe("appearance");
    expect(resolveSettingsTab("constructor")).toBe("appearance");
    expect(resolveSettingsTab(["sound", "events"])).toBe("appearance");
  });

  // A phone shows `short`, the desktop rail `label` plus `more`; screen readers get `label` plus `more` everywhere,
  // so what a member sees is always part of the name they can say (WCAG 2.5.3, Label in Name).
  it("keeps every visible label inside the tab's spoken name", () => {
    for (const t of SETTINGS_TABS) {
      const name = [t.label, t.more].filter(Boolean).join(" ").toLowerCase();
      if (t.short) expect(name).toContain(t.short.toLowerCase());
      expect(name.startsWith(t.label.toLowerCase())).toBe(true);
    }
  });

  it("says on the desktop rail that Phone app is also where notifications are", () => {
    const app = SETTINGS_TABS.find((t) => t.id === "app");
    expect(`${app?.label} ${app?.more}`).toBe("Phone app and notifications");
  });

  it("names the tabs in plain words", () => {
    expect(SETTINGS_TABS.map((t) => t.label)).toEqual([
      "Appearance",
      "Sound",
      "Phone app",
      "Account",
      "Events",
    ]);
  });
});
