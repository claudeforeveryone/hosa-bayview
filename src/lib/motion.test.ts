import { afterEach, describe, expect, it, vi } from "vitest";
import { prefersCalm } from "@/lib/motion";

// The page as the browser would show it: the device's Reduce Motion setting, and the calm flag an older
// Settings stored on <html data-motion="calm">.
function device({ reduce, calm }: { reduce: boolean; calm: boolean }) {
  vi.stubGlobal("window", {
    matchMedia: (q: string) => ({
      matches: reduce && q === "(prefers-reduced-motion: reduce)",
    }),
  });
  vi.stubGlobal("document", {
    documentElement: { dataset: calm ? { motion: "calm" } : {} },
  });
}

afterEach(() => vi.unstubAllGlobals());

describe("prefersCalm", () => {
  it("is calm when the device asks for reduced motion", () => {
    device({ reduce: true, calm: false });
    expect(prefersCalm()).toBe(true);
  });

  it("is calm for a member who saved calm motion, even with Reduce Motion off", () => {
    device({ reduce: false, calm: true });
    expect(prefersCalm()).toBe(true);
  });

  it("moves when neither asks for calm", () => {
    device({ reduce: false, calm: false });
    expect(prefersCalm()).toBe(false);
  });
});
