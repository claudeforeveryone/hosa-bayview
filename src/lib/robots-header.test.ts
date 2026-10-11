import { getPathMatch } from "next/dist/shared/lib/router/utils/path-match";
import { describe, expect, it } from "vitest";
import nextConfig from "../../next.config";
import { INDEXED_PATHS } from "./seo";

// The X-Robots-Tag a response gets, worked out the way Next applies config headers: every matching rule in order,
// a later rule with the same key wins.
async function robotsHeader(path: string): Promise<string | undefined> {
  const rules = (await nextConfig.headers?.()) ?? [];
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
    ]) {
      expect(await robotsHeader(path), path).toBe("noindex, nofollow");
    }
  });
});
