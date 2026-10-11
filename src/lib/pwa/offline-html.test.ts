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
    expect([...html.matchAll(/(?:src|href)="([^"]*)"/g)].map((m) => m[1])).toEqual([
      "/brand/classic.png",
      "",
    ]);
  });

  it("says what happened and offers a retry of the same page", () => {
    const html = offlineHtml(null);
    expect(html).toContain("<h1>You&rsquo;re offline</h1>");
    expect(html).toContain('<a class="btn" href="">Try again</a>');
    expect(html).toContain('<html lang="en"');
  });
});
