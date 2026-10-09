import { describe, expect, it, vi } from "vitest";
import {
  INTRO_EVERY_MS,
  INTRO_KEY,
  introScript,
  shouldPlayIntro,
} from "./intro";

describe("shouldPlayIntro", () => {
  const now = 1_800_000_000_000;

  it("plays on a first visit", () => {
    expect(shouldPlayIntro(null, now, false)).toBe(true);
  });

  it("stays quiet on a refresh soon after", () => {
    expect(shouldPlayIntro(now - 60_000, now, false)).toBe(false);
    expect(shouldPlayIntro(now - INTRO_EVERY_MS + 1, now, false)).toBe(false);
  });

  it("plays again once enough time has passed", () => {
    expect(shouldPlayIntro(now - INTRO_EVERY_MS, now, false)).toBe(true);
  });

  it("never plays for reduced motion", () => {
    expect(shouldPlayIntro(null, now, true)).toBe(false);
  });

  it("treats a bad or future stamp as stale", () => {
    expect(shouldPlayIntro(Number.NaN, now, false)).toBe(true);
    expect(shouldPlayIntro(now + 10_000, now, false)).toBe(true);
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
  stored,
  reduced = false,
  webdriver = false,
  now = 1_800_000_000_000,
}: {
  stored: string | null;
  reduced?: boolean;
  webdriver?: boolean;
  now?: number;
}) {
  const attrs = new Set<string>();
  const store = new Map<string, string>();
  if (stored !== null) store.set(INTRO_KEY, stored);
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
    Date: { now: () => now },
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
  const now = 1_800_000_000_000;

  it("marks the page and stamps the visit on a first load", () => {
    const { attrs, store } = runScript({ stored: null, now });
    expect(attrs.has("data-intro")).toBe(true);
    expect(attrs.has("data-intro-wait")).toBe(true);
    expect(store.get(INTRO_KEY)).toBe(String(now));
  });

  it("agrees with shouldPlayIntro on recent, stale and odd stamps", () => {
    for (const stored of [
      String(now - 60_000),
      String(now - INTRO_EVERY_MS),
      "junk",
      String(now + 5),
    ]) {
      expect(runScript({ stored, now }).attrs.has("data-intro")).toBe(
        shouldPlayIntro(Number(stored), now, false),
      );
    }
  });

  it("stays off for reduced motion and automated browsers", () => {
    expect(runScript({ stored: null, reduced: true }).attrs.size).toBe(0);
    expect(runScript({ stored: null, webdriver: true }).attrs.size).toBe(0);
  });

  it("a tap skips it, clears the banner hold and swallows its click", () => {
    const page = runScript({ stored: null });
    page.listeners.pointerup(event("pointerup"));
    expect(page.attrs.size).toBe(0);
    expect(page.listeners.pointerup).toBeUndefined();
    expect(page.listeners.keydown).toBeUndefined();
    const click = event("click");
    page.listeners.click(click);
    expect(click.preventDefault).toHaveBeenCalled();
    expect(page.listeners.click).toBeUndefined();
  });

  it("a key skips it without touching clicks", () => {
    const page = runScript({ stored: null });
    page.listeners.keydown(event("keydown", "Shift"));
    expect(page.attrs.has("data-intro")).toBe(true);
    page.listeners.keydown(event("keydown", "Enter"));
    expect(page.attrs.size).toBe(0);
    expect(page.listeners.click).toBeUndefined();
  });

  it("the timers clear both marks", () => {
    const page = runScript({ stored: null });
    page.timers.forEach((f) => f());
    expect(page.attrs.size).toBe(0);
  });
});
