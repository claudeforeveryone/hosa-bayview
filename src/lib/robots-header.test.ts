import type { NextConfig } from "next";
import { PHASE_PRODUCTION_SERVER } from "next/constants";
import { getPathMatch } from "next/dist/shared/lib/router/utils/path-match";
import { describe, expect, it } from "vitest";
import exported from "../../next.config";
import { INDEXED_PATHS } from "./seo";

// next.config may export the config itself or a function of the build phase; read it the way `next start` does.
type ConfigFn = (
  phase: string,
  ctx: { defaultConfig: NextConfig },
) => NextConfig | Promise<NextConfig>;
async function config(): Promise<NextConfig> {
  const value = exported as NextConfig | ConfigFn;
  return typeof value === "function"
    ? value(PHASE_PRODUCTION_SERVER, { defaultConfig: {} })
    : value;
}

// The X-Robots-Tag a response gets, worked out the way Next applies config headers: every matching rule in order,
// a later rule with the same key wins.
async function robotsHeader(path: string): Promise<string | undefined> {
  const rules = (await (await config()).headers?.()) ?? [];
  let value: string | undefined;
  for (const rule of rules) {
    if (getPathMatch(rule.source)(path) === false) continue;
    for (const h of rule.headers) if (h.key === "X-Robots-Tag") value = h.value;
  }
  return value;
}

describe("X-Robots-Tag header", () => {
  it("lets exactly the public pages be indexed", async () => {
    for (const path of INDEXED_PATHS)
      expect(await robotsHeader(path), path).toBe("index, follow");
  });

  // Google ignores a structured-data logo (and won't show a card image in search) when the file says noindex.
  it("lets the logo, app icons and social card images be indexed", async () => {
    for (const path of [
      "/icon.png",
      "/apple-icon.png",
      "/opengraph-image.png",
      "/twitter-image.png",
    ])
      expect(await robotsHeader(path), path).toBe("index, follow");
  });

  it("keeps everything else noindex, including lookalikes and files", async () => {
    for (const path of [
      "/",
      "/settings",
      "/c/abc",
      "/members/abc",
      "/forgot-password",
      "/login/x",
      "/terms-old",
      "/privacyx",
      "/brand/classic.png",
      "/sitemap.xml",
      "/iconXpng",
      "/icon.png/x",
      "/x/icon.png",
      "/opengraph-image.png.bak",
    ]) {
      expect(await robotsHeader(path), path).toBe("noindex, nofollow");
    }
  });
});
