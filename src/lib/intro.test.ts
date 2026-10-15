import { describe, expect, it, vi } from "vitest";
import { introScript, shouldPlayIntro } from "./intro";

describe("shouldPlayIntro", () => {
  it("plays every time the site is opened, refreshes included", () => {
    expect(shouldPlayIntro("navigate", false)).toBe(true);
    expect(shouldPlayIntro("reload", false)).toBe(true);
    expect(shouldPlayIntro(null, false)).toBe(true);
  });

  it("stays quiet coming back with the Back button", () => {
    expect(shouldPlayIntro("back_forward", false)).toBe(false);
  });

  it("never plays for reduced motion", () => {
    expect(shouldPlayIntro("navigate", true)).toBe(false);
  });
});

type FakeEvent = {
  type: string;
  key?: string;
  preventDefault: () => void;
  stopPropagation: () => void;
};

// Runs the real inline script against a stand-in page, so it can't drift from shouldPlayIntro.
function runScript({
  navigation = "navigate",
  reduced = false,
  calm = false,
  webdriver = false,
  pathname = "/login",
}: {
  navigation?: string | null;
  reduced?: boolean;
  calm?: boolean;
  webdriver?: boolean;
  pathname?: string;
} = {}) {
  const attrs = new Set<string>();
  const store = new Map<string, string>();
  if (calm) store.set("motion", "calm");
  const listeners: Record<string, (e: FakeEvent) => void> = {};
  const timers: (() => void)[] = [];
  const env = {
    document: {
      documentElement: {
        setAttribute: (a: string) => attrs.add(a),
        removeAttribute: (a: string) => attrs.delete(a),
        hasAttribute: (a: string) => attrs.has(a),
      },
    },
    localStorage: {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => store.set(k, v),
    },
    matchMedia: () => ({ matches: reduced }),
    navigator: { webdriver },
    location: { pathname },
    performance: {
      getEntriesByType: () => (navigation === null ? [] : [{ type: navigation }]),
    },
    addEventListener: (t: string, f: (e: FakeEvent) => void) => {
      listeners[t] = f;
    },
    removeEventListener: (t: string) => {
      delete listeners[t];
    },
    setTimeout: (f: () => void) => timers.push(f),
  };
  new Function(...Object.keys(env), introScript)(...Object.values(env));
  return { attrs, store, listeners, timers };
}

const event = (type: string, key?: string): FakeEvent => ({
  type,
  key,
  preventDefault: vi.fn(),
  stopPropagation: vi.fn(),
});

describe("introScript", () => {
  it("marks the page on a fresh visit and on a refresh", () => {
    for (const navigation of ["navigate", "reload", null]) {
      const { attrs } = runScript({ navigation });
      expect(attrs.has("data-intro"), String(navigation)).toBe(true);
      expect(attrs.has("data-intro-played"), String(navigation)).toBe(true);
    }
  });

  it("agrees with shouldPlayIntro on every navigation type", () => {
    for (const navigation of ["navigate", "reload", "back_forward", "prerender"]) {
      expect(runScript({ navigation }).attrs.has("data-intro"), navigation).toBe(
        shouldPlayIntro(navigation, false),
      );
    }
  });

  it("stays off for reduced motion, a stored calm and automated browsers", () => {
    expect(runScript({ reduced: true }).attrs.size).toBe(0);
    expect(runScript({ calm: true }).attrs.size).toBe(0);
    expect(runScript({ webdriver: true }).attrs.size).toBe(0);
  });

  it("stays off on the terms and privacy pages", () => {
    for (const pathname of ["/terms", "/privacy", "/privacy/", "/terms/x"]) {
      expect(runScript({ pathname }).attrs.size, pathname).toBe(0);
    }
  });

  it("still plays on lookalike paths and the sign-in pages", () => {
    for (const pathname of ["/", "/login", "/signup", "/termsx", "/privacy-old", "/c/terms"]) {
      expect(runScript({ pathname }).attrs.has("data-intro"), pathname).toBe(true);
    }
  });

  it("a tap skips it, keeps the banner still and swallows its click", () => {
    const page = runScript();
    page.listeners.pointerup(event("pointerup"));
    expect([...page.attrs.keys()]).toEqual(["data-intro-played"]);
    expect(page.listeners.pointerup).toBeUndefined();
    expect(page.listeners.keydown).toBeUndefined();
    const click = event("click");
    page.listeners.click(click);
    expect(click.preventDefault).toHaveBeenCalled();
    expect(page.listeners.click).toBeUndefined();
  });

  it("a key skips it without touching clicks", () => {
    const page = runScript();
    page.listeners.keydown(event("keydown", "Shift"));
    expect(page.attrs.has("data-intro")).toBe(true);
    page.listeners.keydown(event("keydown", "Enter"));
    expect([...page.attrs.keys()]).toEqual(["data-intro-played"]);
    expect(page.listeners.click).toBeUndefined();
  });

  it("the timer ends the opener; the banner stays still for this page load", () => {
    const page = runScript();
    page.timers.forEach((f) => f());
    expect([...page.attrs.keys()]).toEqual(["data-intro-played"]);
  });
});
