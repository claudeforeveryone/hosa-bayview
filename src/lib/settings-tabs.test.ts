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

  it("names the tabs in plain words", () => {
    expect(SETTINGS_TABS.map((t) => t.label)).toEqual([
      "Appearance",
      "Sound",
      "Account",
      "Events",
    ]);
  });
});
