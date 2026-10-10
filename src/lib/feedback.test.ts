import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { parseHaptics, parseSound } from "./appearance";
import { BUZZ, TONES, type FeedbackKind } from "./feedback";

// matchMedia for a touch screen (coarse pointer) or a mouse.
const touch = (coarse: boolean) => (q: string) => ({ matches: q === "(pointer: coarse)" ? coarse : false });

const KINDS: FeedbackKind[] = ["correct", "wrong", "flip", "submit", "win"];

describe("sound and haptics settings", () => {
  it("sound is off unless it was switched on", () => {
    expect(parseSound(null)).toBe("off");
    expect(parseSound("on")).toBe("on");
    expect(parseSound("off")).toBe("off");
    expect(parseSound("loud")).toBe("off");
  });

  it("haptics are on unless they were switched off", () => {
    expect(parseHaptics(null)).toBe("on");
    expect(parseHaptics("off")).toBe("off");
    expect(parseHaptics("on")).toBe("on");
    expect(parseHaptics("buzz")).toBe("on");
  });
});

describe("tones and patterns", () => {
  it("every kind has a tone under 150 ms and quiet", () => {
    for (const kind of KINDS) {
      const notes = TONES[kind];
      expect(notes.length).toBeGreaterThan(0);
      expect(Math.max(...notes.map((n) => n.at + n.dur))).toBeLessThanOrEqual(
        0.15,
      );
      for (const n of notes) expect(n.gain).toBeLessThanOrEqual(0.1);
    }
  });

  it("every kind has a short vibration", () => {
    for (const kind of KINDS) {
      const total = BUZZ[kind].reduce((a, b) => a + b, 0);
      expect(total).toBeGreaterThan(0);
      expect(total).toBeLessThanOrEqual(200);
    }
  });
});

// A stand-in AudioContext that records what was scheduled.
function fakeAudio() {
  const made: { started: number; type: string }[] = [];
  const param = () => ({
    setValueAtTime: vi.fn(),
    exponentialRampToValueAtTime: vi.fn(),
  });
  class FakeContext {
    static instances = 0;
    static all: FakeContext[] = [];
    static startState = "suspended";
    state = FakeContext.startState;
    currentTime = 0;
    destination = {};
    resume = vi.fn(() => {
      this.state = "running";
      return Promise.resolve();
    });
    constructor() {
      FakeContext.instances += 1;
      FakeContext.all.push(this);
    }
    createOscillator() {
      const osc = {
        type: "sine",
        frequency: param(),
        connect: vi.fn(),
        start: vi.fn((t: number) => made.push({ started: t, type: osc.type })),
        stop: vi.fn(),
      };
      return osc;
    }
    createGain() {
      return { gain: param(), connect: vi.fn() };
    }
  }
  return { FakeContext, made };
}

describe("feedback()", () => {
  let store: Record<string, string>;
  let vibrate: ReturnType<typeof vi.fn>;
  let audio: ReturnType<typeof fakeAudio>;

  beforeEach(() => {
    vi.resetModules();
    store = {};
    vibrate = vi.fn(() => true);
    audio = fakeAudio();
    vi.stubGlobal("localStorage", { getItem: (k: string) => store[k] ?? null });
    vi.stubGlobal("window", { AudioContext: audio.FakeContext, matchMedia: touch(true) });
    vi.stubGlobal("navigator", { vibrate });
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  const load = () => import("./feedback");

  it("by default buzzes and stays silent", async () => {
    const { feedback } = await load();
    feedback("correct");
    expect(vibrate).toHaveBeenCalledWith(BUZZ.correct);
    expect(audio.FakeContext.instances).toBe(0);
  });

  it("plays the tone when Sound is on, waking the context", async () => {
    store.sound = "on";
    const { feedback } = await load();
    feedback("win");
    expect(audio.FakeContext.instances).toBe(1);
    expect(audio.made).toHaveLength(TONES.win.length);
    feedback("flip");
    expect(audio.FakeContext.instances).toBe(1); // one context, reused
  });

  it("does nothing when both are off", async () => {
    store.haptics = "off";
    const { feedback } = await load();
    feedback("wrong");
    expect(vibrate).not.toHaveBeenCalled();
    expect(audio.FakeContext.instances).toBe(0);
  });

  it("skips the buzz where the device can't vibrate, without throwing", async () => {
    vi.stubGlobal("navigator", {});
    store.sound = "on";
    const { feedback, canVibrate } = await load();
    expect(canVibrate()).toBe(false);
    expect(() => feedback("submit")).not.toThrow();
    expect(audio.made).toHaveLength(TONES.submit.length);
  });

  it("stays quiet where there is no WebAudio", async () => {
    vi.stubGlobal("window", { matchMedia: touch(true) });
    store.sound = "on";
    const { feedback } = await load();
    expect(() => feedback("correct")).not.toThrow();
    expect(vibrate).toHaveBeenCalled();
  });

  it("primes audio only when Sound is on", async () => {
    const { primeFeedback } = await load();
    primeFeedback();
    expect(audio.FakeContext.instances).toBe(0);
    store.sound = "on";
    primeFeedback();
    expect(audio.FakeContext.instances).toBe(1);
  });

  it("survives storage that throws", async () => {
    vi.stubGlobal("localStorage", {
      getItem: () => {
        throw new Error("blocked");
      },
    });
    const { feedback } = await load();
    expect(() => feedback("flip")).not.toThrow();
    expect(vibrate).toHaveBeenCalledWith(BUZZ.flip); // falls back to the defaults
  });
  it("never buzzes on a mouse-driven device, even where vibrate exists (desktop Chrome)", async () => {
    vi.stubGlobal("window", { AudioContext: audio.FakeContext, matchMedia: touch(false) });
    const { feedback, canVibrate } = await load();
    expect(canVibrate()).toBe(false);
    feedback("correct");
    expect(vibrate).not.toHaveBeenCalled();
  });

  it("before any tap on the page, makes no audio context and no buzz", async () => {
    vi.stubGlobal("navigator", { vibrate, userActivation: { hasBeenActive: false } });
    store.sound = "on";
    const { feedback, primeFeedback } = await load();
    primeFeedback();
    feedback("submit");
    expect(audio.FakeContext.instances).toBe(0);
    expect(vibrate).not.toHaveBeenCalled();
  });

  it("sound: false (a timer, not a tap) skips the tone but keeps the buzz", async () => {
    store.sound = "on";
    const { feedback } = await load();
    feedback("submit", { sound: false });
    expect(audio.FakeContext.instances).toBe(0);
    expect(vibrate).toHaveBeenCalledWith(BUZZ.submit);
  });

  it("wakes an iOS-interrupted context, leaves a running one alone", async () => {
    store.sound = "on";
    audio.FakeContext.startState = "interrupted";
    const { primeFeedback } = await load();
    primeFeedback();
    primeFeedback();
    // Resumed once from "interrupted"; the fake is "running" after that, so no second resume.
    expect(audio.FakeContext.all[0].resume).toHaveBeenCalledTimes(1);
  });
});
