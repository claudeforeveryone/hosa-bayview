import { describe, expect, it } from "vitest";
import { HERO_SEEN_KEY, addSeen, heroRestScript } from "./hero";

function runScript(stored: string | null, throws = false) {
  const attrs = new Map<string, string>();
  const env = {
    document: {
      documentElement: {
        setAttribute: (k: string, v: string) => attrs.set(k, v),
      },
    },
    sessionStorage: {
      getItem: (k: string) => {
        if (throws) throw new Error("blocked");
        return k === HERO_SEEN_KEY ? stored : null;
      },
    },
  };
  new Function(...Object.keys(env), heroRestScript)(...Object.values(env));
  return attrs;
}

describe("banner seen this session", () => {
  it("adds a variant once, in a stable order", () => {
    expect(addSeen(null, "panel")).toBe("panel");
    expect(addSeen("panel", "bare")).toBe("bare panel");
    expect(addSeen("bare panel", "bare")).toBe("bare panel");
  });

  it("drops junk from the stored list", () => {
    expect(addSeen("hero <script>", "bare")).toBe("bare");
  });

  it("first load of the session: nothing rests", () => {
    expect(runScript(null).size).toBe(0);
  });

  it("a reload rests the banners already seen", () => {
    expect(runScript("panel").get("data-hero-rest")).toBe("panel");
    expect(runScript("bare panel").get("data-hero-rest")).toBe("bare panel");
  });

  it("ignores a tampered value and blocked storage", () => {
    expect(runScript('panel"><x').size).toBe(0);
    expect(runScript("panel", true).size).toBe(0);
  });
});
