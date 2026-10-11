import { describe, expect, it } from "vitest";
import { isPublicPath } from "./route-gate";
import { INDEXED_PATHS, jsonLdHtml, publicPage, robots, siteJsonLd, siteUrl, sitemap } from "./seo";

describe("siteUrl", () => {
  it("uses the configured origin, without a trailing slash or path", () => {
    expect(siteUrl("https://hosa.example.ca")).toBe("https://hosa.example.ca");
    expect(siteUrl("https://hosa.example.ca/")).toBe("https://hosa.example.ca");
    expect(siteUrl("https://hosa.example.ca/some/path?x=1")).toBe(
      "https://hosa.example.ca",
    );
    expect(siteUrl("  https://hosa.example.ca  ")).toBe(
      "https://hosa.example.ca",
    );
    expect(siteUrl("http://localhost:3103")).toBe("http://localhost:3103");
  });

  it("falls back to the production address when unset or not an http(s) URL", () => {
    for (const bad of [
      undefined,
      "",
      "   ",
      "hosa-bayview.vercel.app",
      "javascript:alert(1)",
      "ftp://x.ca",
    ]) {
      expect(siteUrl(bad), String(bad)).toBe("https://hosa-bayview.vercel.app");
    }
  });
});

// Google's robots.txt precedence: the longest matching rule wins, allow wins a tie, "$" anchors the end, "*" is any run.
function crawlable(
  rules: { allow: string[]; disallow: string[] },
  path: string,
): boolean {
  const hit = (rule: string) => {
    const anchored = rule.endsWith("$");
    const body = (anchored ? rule.slice(0, -1) : rule)
      .replace(/[.+?^{}()|[\]\\]/g, "\\$&")
      .replace(/\*/g, ".*");
    return new RegExp(`^${body}${anchored ? "$" : ""}`).test(path);
  };
  const best = (list: string[]) =>
    Math.max(-1, ...list.filter(hit).map((r) => r.length));
  const allow = best(rules.allow);
  const disallow = best(rules.disallow);
  return allow >= disallow;
}

describe("robots", () => {
  const file = robots("https://hosa.example.ca");
  const rules = Array.isArray(file.rules) ? file.rules[0] : file.rules;
  const list = (v: string | string[] | undefined) =>
    v === undefined ? [] : Array.isArray(v) ? v : [v];
  const r = { allow: list(rules.allow), disallow: list(rules.disallow) };

  it("speaks to every crawler and points at the sitemap", () => {
    expect(rules.userAgent).toBe("*");
    expect(file.sitemap).toBe("https://hosa.example.ca/sitemap.xml");
  });

  it("lets crawlers reach the public pages, the home redirect and what those pages need to render", () => {
    for (const path of [
      "/",
      "/login",
      "/signup",
      "/terms",
      "/privacy",
      "/_next/static/chunks/app.js",
      "/_next/static/media/barlow.woff2",
      "/brand/classic.png",
      "/opengraph-image.png",
      "/twitter-image.png",
      "/icon.png",
      "/apple-icon.png",
    ]) {
      expect(crawlable(r, path), path).toBe(true);
    }
  });

  it("keeps crawlers out of the signed-in app, including routes added later", () => {
    for (const path of [
      "/settings",
      "/admin",
      "/c/abc/tests",
      "/members/abc",
      "/files/abc",
      "/api/keepalive",
      "/auth/callback",
      "/forgot-password",
      "/reset-password",
      "/developer",
      "/some-page-added-next-year",
      "/?tab=x",
    ]) {
      expect(crawlable(r, path), path).toBe(false);
    }
  });
});

describe("sitemap", () => {
  it("lists the four public pages, absolute, and nothing from the app", () => {
    const entries = sitemap("https://hosa.example.ca");
    expect(entries.map((e) => e.url).sort()).toEqual([
      "https://hosa.example.ca/login",
      "https://hosa.example.ca/privacy",
      "https://hosa.example.ca/signup",
      "https://hosa.example.ca/terms",
    ]);
  });

  it("dates the legal pages by their effective date", () => {
    const entries = sitemap("https://hosa.example.ca");
    const terms = entries.find((e) => e.url.endsWith("/terms"));
    expect(terms?.lastModified).toEqual(new Date("2026-10-11T00:00:00-04:00"));
  });
});

describe("publicPage", () => {
  const meta = publicPage({ title: "Terms of use", description: "The rules.", path: "/terms" });

  it("opts the page back in to indexing, with its own canonical address", () => {
    expect(meta.robots).toEqual({ index: true, follow: true });
    expect(meta.alternates).toEqual({ canonical: "/terms" });
  });

  it("gives link previews the page's own title, description and address", () => {
    expect(meta.title).toBe("Terms of use");
    expect(meta.description).toBe("The rules.");
    expect(meta.openGraph).toMatchObject({ title: "Terms of use", description: "The rules.", url: "/terms" });
    expect(meta.twitter).toMatchObject({ title: "Terms of use", description: "The rules." });
  });

  it("only indexes pages a guest can open", () => {
    for (const path of INDEXED_PATHS) expect(isPublicPath(path), path).toBe(true);
  });
});

describe("structured data", () => {
  const data = siteJsonLd("https://hosa.example.ca");
  const graph = data["@graph"] as Record<string, unknown>[];

  it("describes the site and who publishes it, at the configured address", () => {
    const org = graph.find((n) => n["@type"] === "Organization");
    const site = graph.find((n) => n["@type"] === "WebSite");
    expect(org).toMatchObject({ name: "HOSA Bayview", url: "https://hosa.example.ca" });
    expect(site).toMatchObject({ name: "HOSA Bayview", url: "https://hosa.example.ca", inLanguage: "en-CA" });
    expect(site?.publisher).toEqual({ "@id": org?.["@id"] });
  });

  it("says plainly that the site is independent of HOSA", () => {
    const org = graph.find((n) => n["@type"] === "Organization");
    expect(String(org?.description)).toContain("not affiliated with or endorsed by HOSA-Future Health Professionals");
  });

  it("serializes so a value can never close the script tag", () => {
    const html = jsonLdHtml({ name: "</script><script>alert(1)</script>" });
    expect(html).not.toContain("<");
    expect(JSON.parse(html)).toEqual({ name: "</script><script>alert(1)</script>" });
  });
});
