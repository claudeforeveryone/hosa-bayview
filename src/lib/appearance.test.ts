import { describe, expect, it } from "vitest";
import { FONTS, appearanceScript, isFont } from "./appearance";

// Runs the real inline script against a stand-in page, so it can't drift from the helpers.
function runScript(stored: Record<string, string>) {
  const dataset: Record<string, string> = {};
  const env = {
    document: { documentElement: { dataset } },
    localStorage: { getItem: (k: string) => stored[k] ?? null },
    matchMedia: () => ({ matches: false }),
  };
  new Function(...Object.keys(env), appearanceScript)(...Object.values(env));
  return dataset;
}

describe("font choice", () => {
  it("offers default, readable and dyslexic", () => {
    expect(FONTS.map((f) => f.id)).toEqual(["default", "readable", "dyslexic"]);
  });

  it("rejects anything else", () => {
    expect(isFont("readable")).toBe(true);
    expect(isFont("comic")).toBe(false);
    expect(isFont(null)).toBe(false);
  });

  it("is set on <html> before paint for a saved choice", () => {
    expect(runScript({ font: "readable" }).font).toBe("readable");
    expect(runScript({ font: "dyslexic" }).font).toBe("dyslexic");
  });

  it("leaves the default look alone for a missing or invalid value", () => {
    expect(runScript({}).font).toBeUndefined();
    expect(runScript({ font: "default" }).font).toBeUndefined();
    expect(runScript({ font: "bogus" }).font).toBeUndefined();
  });
});
