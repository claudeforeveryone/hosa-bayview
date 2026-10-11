import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { offlineHtml } from "./offline-html";

describe("offlineHtml", () => {
  it("stamps the proxy's nonce on its one inline script", () => {
    const html = offlineHtml("abc123DEF456+/==");
    expect(html.match(/<script/g)).toHaveLength(1);
    expect(html).toContain('<script nonce="abc123DEF456+/==">');
  });

  it("drops the script rather than echo a nonce that isn't one", () => {
    for (const bad of [null, "", '"><script>alert(1)</script>', "x y"]) {
      const html = offlineHtml(bad);
      expect(html).not.toContain("<script");
      expect(html).not.toContain("alert(1)");
    }
  });

  it("loads nothing from outside this site, and only the precached logo from it", () => {
    const html = offlineHtml("abc123DEF456");
    expect(html).not.toMatch(/https?:\/\//);
    expect(
      [...html.matchAll(/(?:src|href)="([^"]*)"/g)].map((m) => m[1]),
    ).toEqual(["/brand/classic.png", ""]);
  });

  it("sets its type in the brand's Barlow, from font files the service worker precaches", () => {
    const html = offlineHtml(null);
    const fonts = [...html.matchAll(/url\(([^)]+)\)/g)].map((m) => m[1]);
    expect(fonts.sort()).toEqual([
      "/fonts/barlow-condensed-latin-700-normal.woff2",
      "/fonts/barlow-latin-400-normal.woff2",
      "/fonts/barlow-latin-600-normal.woff2",
    ]);
    // Offline, only what the worker stored at install can load.
    const sw = readFileSync(join(process.cwd(), "public", "sw.js"), "utf8");
    const precache = sw.slice(sw.indexOf("const PRECACHE"), sw.indexOf("];"));
    for (const font of fonts) {
      expect(precache, font).toContain(`"${font}"`);
      expect(existsSync(join(process.cwd(), "public", font)), font).toBe(true);
    }
    expect(html).toMatch(/h1\{font-family:"Barlow Condensed"/);
    expect(html).toMatch(/body\{[^}]*font:[^;}]*Barlow,/);
  });

  it("says what happened and offers a retry of the same page", () => {
    const html = offlineHtml(null);
    expect(html).toContain("<h1>You&rsquo;re offline</h1>");
    expect(html).toContain('<a class="btn" href="">Try again</a>');
    expect(html).toContain('<html lang="en"');
  });
});
