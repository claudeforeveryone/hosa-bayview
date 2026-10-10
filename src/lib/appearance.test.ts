import { describe, expect, it } from "vitest";
import {
  DARK_TEXT,
  FONTS,
  LIGHT_TEXT,
  MODES,
  appearanceScript,
  customVars,
  isFont,
  parseHex,
  parseNotifySound,
  readableOn,
} from "./appearance";

// Runs the real inline script against a stand-in page, so it can't drift from the helpers.
function runPage(stored: Record<string, string>) {
  const dataset: Record<string, string> = {};
  const style: Record<string, string> = {};
  const env = {
    document: {
      documentElement: {
        dataset,
        style: { setProperty: (k: string, v: string) => (style[k] = v) },
      },
    },
    localStorage: { getItem: (k: string) => stored[k] ?? null },
    matchMedia: () => ({ matches: false }),
  };
  new Function(...Object.keys(env), appearanceScript)(...Object.values(env));
  return { dataset, style };
}
const runScript = (stored: Record<string, string>) => runPage(stored).dataset;

describe("font choice", () => {
  it("offers default and dyslexia-friendly only", () => {
    expect(FONTS.map((f) => f.id)).toEqual(["default", "dyslexic"]);
  });

  it("rejects anything else, including the retired readable face", () => {
    expect(isFont("dyslexic")).toBe(true);
    expect(isFont("readable")).toBe(false);
    expect(isFont("comic")).toBe(false);
    expect(isFont(null)).toBe(false);
  });

  it("is set on <html> before paint for a saved choice", () => {
    expect(runScript({ font: "dyslexic" }).font).toBe("dyslexic");
  });

  it("leaves the default look alone for a missing, retired or invalid value", () => {
    expect(runScript({}).font).toBeUndefined();
    expect(runScript({ font: "default" }).font).toBeUndefined();
    expect(runScript({ font: "readable" }).font).toBeUndefined();
    expect(runScript({ font: "bogus" }).font).toBeUndefined();
  });
});

describe("mode labels", () => {
  it("calls following the device Device", () => {
    expect(MODES.find((m) => m.id === "system")?.label).toBe("Device");
  });
});

describe("calm motion stored before the control was removed", () => {
  it("still applies before paint", () => {
    expect(runScript({ motion: "calm" }).motion).toBe("calm");
    expect(runScript({ motion: "full" }).motion).toBeUndefined();
  });
});

describe("notification sound", () => {
  it("is on unless switched off", () => {
    expect(parseNotifySound(null)).toBe("on");
    expect(parseNotifySound("on")).toBe("on");
    expect(parseNotifySound("junk")).toBe("on");
    expect(parseNotifySound("off")).toBe("off");
  });
});

describe("hex colours", () => {
  it("accepts #rgb and #rrggbb, normalised to lowercase #rrggbb", () => {
    expect(parseHex("#ABC")).toBe("#aabbcc");
    expect(parseHex(" #1E3D62 ")).toBe("#1e3d62");
  });

  it("rejects anything that could smuggle more into a style", () => {
    for (const v of ["1e3d62", "#12345", "#1234567", "#ggg", "red", "#fff;color:red", "url(x)", "", null, 5])
      expect(parseHex(v)).toBeNull();
  });

  it("puts white on dark colours and near-black on light ones", () => {
    expect(readableOn("#000000")).toBe(LIGHT_TEXT);
    expect(readableOn("#1e3d62")).toBe(LIGHT_TEXT);
    expect(readableOn("#ffffff")).toBe(DARK_TEXT);
    expect(readableOn("#f5d000")).toBe(DARK_TEXT);
  });
});

describe("custom colours before paint", () => {
  const samples = ["#000000", "#ffffff", "#1e3d62", "#f5d000", "#7fbfff", "#808080", "#a8400f", "#00ff00"];

  it("match customVars for a custom theme and highlight", () => {
    for (const hex of samples) {
      const { dataset, style } = runPage({ palette: "custom", fieldhex: hex, accent: "custom", accenthex: hex });
      expect(style).toEqual(customVars(hex, hex));
      expect(dataset.palette).toBeUndefined();
      expect(dataset.accent).toBe("custom");
    }
  });

  it("accept a short hex", () => {
    expect(runPage({ accent: "custom", accenthex: "#fc0" }).style["--you"]).toBe("#ffcc00");
  });

  it("ignore an invalid saved colour and keep the default look", () => {
    const { dataset, style } = runPage({
      palette: "custom",
      fieldhex: "#fff;background:url(x)",
      accent: "custom",
      accenthex: "nope",
    });
    expect(style).toEqual({});
    expect(dataset.palette).toBeUndefined();
    expect(dataset.accent).toBeUndefined();
  });

  it("ignore a saved colour while a named theme is picked", () => {
    const { dataset, style } = runPage({ palette: "forest", fieldhex: "#ffffff", accent: "teal", accenthex: "#ffffff" });
    expect(style).toEqual({});
    expect(dataset.palette).toBe("forest");
    expect(dataset.accent).toBe("teal");
  });
});

// The Haptics row shows before paint only on touch devices that can vibrate.
function vibrateFlag(nav: object, coarse: boolean) {
  const dataset: Record<string, string> = {};
  const env = {
    document: { documentElement: { dataset } },
    localStorage: { getItem: () => null },
    matchMedia: (q: string) => ({ matches: q === "(pointer: coarse)" ? coarse : false }),
    navigator: nav,
  };
  new Function(...Object.keys(env), appearanceScript)(...Object.values(env));
  return dataset;
}

describe("haptics row", () => {
  it("is shown on a touch screen that can vibrate", () => {
    expect(vibrateFlag({ vibrate: () => true }, true).vibrate).toBe("");
  });

  it("stays hidden on desktop Chrome (vibrate exists, mouse pointer) and on iPhone (no vibrate)", () => {
    expect(vibrateFlag({ vibrate: () => true }, false).vibrate).toBeUndefined();
    expect(vibrateFlag({}, true).vibrate).toBeUndefined();
  });

  it("doesn't stop the rest of the look from applying", () => {
    expect(vibrateFlag({}, false).theme).toBe("light");
  });
});
