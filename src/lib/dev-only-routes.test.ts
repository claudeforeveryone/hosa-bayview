import {
  PHASE_DEVELOPMENT_SERVER,
  PHASE_PRODUCTION_BUILD,
  PHASE_PRODUCTION_SERVER,
} from "next/constants";
import { describe, expect, it } from "vitest";
import config from "../../next.config";

// Dev-only pages are named page.dev.tsx (the owner console fixture gallery). Only `next dev` treats .dev.tsx as a
// page extension, so a production build never sees them as routes and never bundles what they import.
const extensionsFor = async (phase: string) => {
  const resolved = await config(phase);
  return resolved.pageExtensions;
};

describe("dev-only routes", () => {
  it("are pages under next dev", async () => {
    expect(await extensionsFor(PHASE_DEVELOPMENT_SERVER)).toContain("dev.tsx");
  });

  it("are not pages in a production build or server", async () => {
    for (const phase of [PHASE_PRODUCTION_BUILD, PHASE_PRODUCTION_SERVER]) {
      const ext = await extensionsFor(phase);
      expect(ext).toEqual(["tsx", "ts", "jsx", "js"]);
      expect(ext).not.toContain("dev.tsx");
    }
  });

  it("keep the security headers in every phase", async () => {
    for (const phase of [PHASE_DEVELOPMENT_SERVER, PHASE_PRODUCTION_BUILD]) {
      const resolved = await config(phase);
      const headers = await resolved.headers!();
      expect(headers[0].headers.map((h) => h.key)).toContain("X-Frame-Options");
    }
  });
});
