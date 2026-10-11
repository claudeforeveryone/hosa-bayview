import { readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { appearanceScript } from "@/lib/appearance";
import { paintThemeColor, statusBarToken } from "./theme-color";

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

// Each mode and theme's --ground (or --field), read from the real stylesheet so the test follows it.
const css = readFileSync("src/app/globals.css", "utf8");
function tokenOf(selector: string, token = "--ground"): string {
  const at = css.indexOf(`${selector} {`);
  if (at < 0) throw new Error(`no ${selector} block`);
  const block = css.slice(at, css.indexOf("}", at));
  const found = new RegExp(`${token}:\\s*([^;]+);`).exec(block);
  if (!found) throw new Error(`no ${token} in ${selector}`);
  return found[1].trim();
}
const groundOf = (selector: string) => tokenOf(selector);
function stylesheetToken(
  dataset: Record<string, string>,
  token: string,
): string {
  const palette = dataset.palette ? `[data-palette="${dataset.palette}"]` : "";
  const dark = dataset.theme === "dark" ? '[data-theme="dark"]' : "";
  return tokenOf(`:root${palette}${dark}`, token);
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

// Runs the real inline script with a stand-in page whose stylesheet resolves --ground and --field like globals.css
// does. `path` is the address; `narrow` says whether the screen is under the desktop breakpoint (a phone).
function firstPaint(
  stored: Record<string, string>,
  deviceDark = false,
  { path = "/", narrow = true }: { path?: string; narrow?: boolean } = {},
) {
  const dataset: Record<string, string> = {};
  const tags = layoutTags();
  const env = {
    document: {
      documentElement: { dataset, style: { setProperty: () => {} } },
      querySelectorAll: (sel: string) =>
        sel === 'meta[name="theme-color"]' ? tags : [],
    },
    localStorage: { getItem: (k: string) => stored[k] ?? null },
    location: { pathname: path },
    matchMedia: (q: string) => ({
      matches: q.includes("dark")
        ? deviceDark
        : q.includes("max-width")
          ? narrow
          : false,
    }),
    getComputedStyle: () => ({
      getPropertyValue: (k: string) =>
        k === "--ground" || k === "--field"
          ? ` ${stylesheetToken(dataset, k)}`
          : "",
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

// The sign-in pages open on a phone with the navy field band at the top of the screen (the (auth) layout, below the
// desktop breakpoint), so the status bar takes the field's colour there. The installed iPhone app always opens on
// /login, because its storage is separate from Safari's.
describe("the status bar over the sign-in pages", () => {
  it("is the field colour on a phone, and the ground everywhere else", () => {
    expect(statusBarToken("/login", true)).toBe("--field");
    expect(statusBarToken("/signup", true)).toBe("--field");
    expect(statusBarToken("/reset-password", true)).toBe("--field");
    expect(statusBarToken("/login", false)).toBe("--ground");
    expect(statusBarToken("/", true)).toBe("--ground");
    expect(statusBarToken("/settings", true)).toBe("--ground");
    expect(statusBarToken("/loginx", true)).toBe("--ground");
  });

  it("covers every page in the (auth) layout", () => {
    const pages = readdirSync("src/app/(auth)", { withFileTypes: true })
      .filter((e) => e.isDirectory())
      .map((e) => `/${e.name}`);
    expect(pages.length).toBeGreaterThan(3);
    for (const page of pages)
      expect(statusBarToken(page, true)).toBe("--field");
  });

  it("is painted before first paint, from the colour theme's own field", () => {
    const field = tokenOf(":root", "--field");
    const ground = groundOf(":root");
    const maroonDarkField = tokenOf(
      ':root[data-palette="maroon"][data-theme="dark"]',
      "--field",
    );
    expect(firstPaint({}, false, { path: "/login" })).toEqual([field, field]);
    expect(
      firstPaint({ palette: "maroon", theme: "dark" }, false, {
        path: "/login",
      }),
    ).toEqual([maroonDarkField, maroonDarkField]);
    expect(firstPaint({}, false, { path: "/login", narrow: false })).toEqual([
      ground,
      ground,
    ]);
  });
});
