import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { appearanceScript } from "@/lib/appearance";
import { paintThemeColor } from "./theme-color";

// A theme-color tag as the root layout writes it.
function meta(content: string, media: string | null) {
  const attrs: Record<string, string> = { name: "theme-color", content };
  if (media) attrs.media = media;
  return {
    attrs,
    getAttribute: (k: string) => attrs[k] ?? null,
    setAttribute: (k: string, v: string) => {
      attrs[k] = v;
    },
  };
}
const layoutTags = () => [
  meta("#e8f2fa", "(prefers-color-scheme: light)"),
  meta("#1e3d62", "(prefers-color-scheme: dark)"),
];

// Each mode and theme's --ground, read from the real stylesheet so the test follows it.
const css = readFileSync("src/app/globals.css", "utf8");
function groundOf(selector: string): string {
  const at = css.indexOf(`${selector} {`);
  if (at < 0) throw new Error(`no ${selector} block`);
  const block = css.slice(at, css.indexOf("}", at));
  const found = /--ground:\s*([^;]+);/.exec(block);
  if (!found) throw new Error(`no --ground in ${selector}`);
  return found[1].trim();
}
function stylesheetGround(dataset: Record<string, string>): string {
  const palette = dataset.palette ? `[data-palette="${dataset.palette}"]` : "";
  const dark = dataset.theme === "dark" ? '[data-theme="dark"]' : "";
  return groundOf(`:root${palette}${dark}`);
}

describe("paintThemeColor", () => {
  it("puts every theme-color tag on the page's ground, whatever the phone's own light or dark setting", () => {
    const tags = layoutTags();
    expect(paintThemeColor(tags, " #4a121c ")).toBe(2);
    expect(tags.map((t) => t.attrs.content)).toEqual(["#4a121c", "#4a121c"]);
    // The media attributes stay; with both tags the same colour, either one is right.
    expect(tags.map((t) => t.attrs.media)).toEqual([
      "(prefers-color-scheme: light)",
      "(prefers-color-scheme: dark)",
    ]);
  });

  it("changes nothing the second time, so a watcher on the tags can't feed itself", () => {
    const tags = layoutTags();
    paintThemeColor(tags, "#1d4a33");
    expect(paintThemeColor(tags, "#1d4a33")).toBe(0);
  });

  it("leaves the tags alone when the stylesheet gave no ground", () => {
    const tags = layoutTags();
    expect(paintThemeColor(tags, "")).toBe(0);
    expect(tags.map((t) => t.attrs.content)).toEqual(["#e8f2fa", "#1e3d62"]);
  });
});

// Runs the real inline script with a stand-in page whose stylesheet resolves --ground like globals.css does.
function firstPaint(stored: Record<string, string>, deviceDark = false) {
  const dataset: Record<string, string> = {};
  const tags = layoutTags();
  const env = {
    document: {
      documentElement: { dataset, style: { setProperty: () => {} } },
      querySelectorAll: (sel: string) =>
        sel === 'meta[name="theme-color"]' ? tags : [],
    },
    localStorage: { getItem: (k: string) => stored[k] ?? null },
    matchMedia: (q: string) => ({
      matches: q.includes("dark") ? deviceDark : false,
    }),
    getComputedStyle: () => ({
      getPropertyValue: (k: string) =>
        k === "--ground" ? ` ${stylesheetGround(dataset)}` : "",
    }),
  };
  new Function(...Object.keys(env), appearanceScript)(...Object.values(env));
  return tags.map((t) => t.attrs.content);
}

describe("appearanceScript: the status bar before first paint", () => {
  it("follows the app's own mode when it differs from the phone's", () => {
    const light = groundOf(":root");
    const dark = groundOf(':root[data-theme="dark"]');
    expect(firstPaint({ theme: "dark" }, false)).toEqual([dark, dark]);
    expect(firstPaint({ theme: "light" }, true)).toEqual([light, light]);
    expect(firstPaint({}, true)).toEqual([dark, dark]);
  });

  it("follows the colour theme", () => {
    const maroon = groundOf(':root[data-palette="maroon"]');
    const forestDark = groundOf(
      ':root[data-palette="forest"][data-theme="dark"]',
    );
    expect(firstPaint({ palette: "maroon" })).toEqual([maroon, maroon]);
    expect(firstPaint({ palette: "forest", theme: "dark" })).toEqual([
      forestDark,
      forestDark,
    ]);
  });
});
