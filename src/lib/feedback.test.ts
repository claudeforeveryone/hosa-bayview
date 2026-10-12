import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_VOLUME, parseHaptics, parseSound, parseVolume, volumeGain } from "./appearance";
import {
  BUZZ,
  HEADROOM,
  TONES,
  clipCurve,
  envelopeAt,
  peakLevel,
  softClip,
  toneLength,
  type FeedbackKind,
  type Note,
} from "./feedback";

// matchMedia for a touch screen (coarse pointer) or a mouse.
const touch = (coarse: boolean) => (q: string) => ({ matches: q === "(pointer: coarse)" ? coarse : false });

const KINDS: FeedbackKind[] = ["correct", "wrong", "flip", "submit", "win", "notify"];

describe("sound and haptics settings", () => {
  it("sound is on unless it was switched off", () => {
    expect(parseSound(null)).toBe("on");
    expect(parseSound("on")).toBe("on");
    expect(parseSound("off")).toBe("off");
    expect(parseSound("loud")).toBe("on");
  });

  it("volume gain is exponential: x1 at the default, x4 at 100, silent at 0", () => {
    expect(volumeGain(DEFAULT_VOLUME)).toBe(1);
    expect(volumeGain(100)).toBe(4);
    expect(volumeGain(0)).toBe(0);
    expect(volumeGain(80)).toBeGreaterThan(volumeGain(70));
  });

  it("volume is any whole number from 0 to 100, defaulting when unset or junk", () => {
    expect(parseVolume(null)).toBe(DEFAULT_VOLUME);
    expect(parseVolume("")).toBe(DEFAULT_VOLUME);
    expect(parseVolume("loud")).toBe(DEFAULT_VOLUME);
    expect(parseVolume("0")).toBe(0);
    expect(parseVolume("34")).toBe(34);
    expect(parseVolume("72.6")).toBe(73);
    expect(parseVolume("250")).toBe(100);
    expect(parseVolume("-5")).toBe(0);
  });

  it("haptics are on unless they were switched off", () => {
    expect(parseHaptics(null)).toBe("on");
    expect(parseHaptics("off")).toBe("off");
    expect(parseHaptics("on")).toBe("on");
    expect(parseHaptics("buzz")).toBe("on");
  });
});

describe("tones and patterns", () => {
  // Lively but short: a ding-ding, a bwomp, a pop, and fanfares that stop well before the next tap.
  const LONGEST: Record<FeedbackKind, number> = {
    correct: 0.35,
    wrong: 0.3,
    flip: 0.08,
    notify: 0.4,
    submit: 0.8,
    win: 1.2,
  };

  it("every kind has a tone that ends in time", () => {
    for (const kind of KINDS) {
      const notes = TONES[kind];
      expect(notes.length).toBeGreaterThan(0);
      expect(toneLength(notes)).toBeLessThanOrEqual(LONGEST[kind]);
      for (const n of notes) {
        expect(n.gain).toBeGreaterThan(0);
        expect(n.gain).toBeLessThanOrEqual(0.2);
        expect(n.at).toBeGreaterThanOrEqual(0);
        expect((n.attack ?? 0.004) + (n.hold ?? 0)).toBeLessThan(n.dur);
      }
    }
  });

  it("bigger moments sound bigger: the win outlasts a finished test, which outlasts a ding", () => {
    expect(toneLength(TONES.win)).toBeGreaterThan(toneLength(TONES.submit));
    expect(toneLength(TONES.submit)).toBeGreaterThan(toneLength(TONES.correct));
    expect(TONES.win.length).toBeGreaterThan(TONES.submit.length);
    expect(peakLevel(TONES.win)).toBeGreaterThanOrEqual(peakLevel(TONES.submit));
  });

  // The main voices (triangles), in the order they start.
  const voices = (notes: Note[]) => notes.filter((n) => n.type === "triangle").sort((a, b) => a.at - b.at);

  it("right climbs and wrong falls", () => {
    const up = voices(TONES.correct).map((n) => n.freq);
    expect(up.length).toBeGreaterThanOrEqual(2);
    for (let i = 1; i < up.length; i++) expect(up[i]).toBeGreaterThan(up[i - 1]);
    const down = voices(TONES.wrong);
    expect(down.length).toBe(2);
    expect(down[1].freq).toBeLessThan(down[0].freq);
    for (const n of down) {
      expect(n.to).toBeLessThan(n.freq); // each note droops
      expect(n.lowpass).toBeLessThanOrEqual(1500); // muffled, not a buzzer
    }
  });

  it("fanfares run up before the final chord", () => {
    for (const kind of ["submit", "win"] as const) {
      const run = voices(TONES[kind]).filter((n) => !n.hold);
      for (let i = 1; i < run.length; i++) expect(run[i].freq).toBeGreaterThan(run[i - 1].freq);
      expect(TONES[kind].some((n) => n.hold)).toBe(true);
    }
  });

  it("no cue gets loud enough to crack, even at volume 100 (x4)", () => {
    for (const kind of KINDS) {
      const peak = peakLevel(TONES[kind]);
      expect(peak).toBeGreaterThan(0.1); // not bland: clearly audible at the default
      expect(peak * volumeGain(100)).toBeLessThanOrEqual(1);
    }
  });

  it("a note's envelope rises fast, holds, and dies away", () => {
    const n: Note = { at: 0.1, dur: 0.5, freq: 440, type: "sine", gain: 0.1, hold: 0.2 };
    expect(envelopeAt(n, 0.05)).toBe(0);
    expect(envelopeAt(n, 0.104)).toBeCloseTo(0.1, 5);
    expect(envelopeAt(n, 0.2)).toBeGreaterThan(0.06);
    expect(envelopeAt(n, 0.2)).toBeLessThan(0.1);
    expect(envelopeAt(n, 0.59)).toBeLessThan(0.001);
    expect(envelopeAt(n, 0.7)).toBe(0);
  });

  it("the soft clipper is transparent at normal levels and never passes 1", () => {
    expect(softClip(0)).toBe(0);
    expect(softClip(0.5)).toBe(0.5);
    expect(softClip(-0.8)).toBe(-0.8);
    expect(softClip(0.9)).toBeLessThan(0.9);
    expect(softClip(0.9)).toBeGreaterThan(0.8);
    expect(softClip(HEADROOM)).toBeLessThanOrEqual(1);
    expect(softClip(-HEADROOM)).toBeGreaterThanOrEqual(-1);
    const curve = clipCurve(5); // inputs -2, -1, 0, 1, 2
    expect(curve[2]).toBe(0);
    expect(curve[4]).toBeCloseTo(softClip(HEADROOM), 5);
    for (let i = 1; i < curve.length; i++) expect(curve[i]).toBeGreaterThan(curve[i - 1]);
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
  const made: { started: number; type: string; onended: (() => void) | null; disconnect: () => void }[] = [];
  const shapers: { curve: Float32Array | null; connect: ReturnType<typeof vi.fn> }[] = [];
  const param = () => ({
    value: 0,
    setValueAtTime: vi.fn(),
    exponentialRampToValueAtTime: vi.fn(),
  });
  const node = () => ({ connect: vi.fn(), disconnect: vi.fn() });
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
        ...node(),
        type: "sine",
        frequency: param(),
        onended: null as (() => void) | null,
        start: vi.fn((t: number) => made.push(Object.assign(osc, { started: t }))),
        stop: vi.fn(),
      };
      return osc;
    }
    createGain() {
      return { ...node(), gain: param() };
    }
    createBiquadFilter() {
      return { ...node(), type: "lowpass", frequency: param(), Q: param() };
    }
    createWaveShaper() {
      const shaper = { ...node(), curve: null as Float32Array | null, oversample: "none" };
      shapers.push(shaper);
      return shaper;
    }
  }
  return { FakeContext, made, shapers };
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

  it("by default buzzes and plays the tone", async () => {
    const { feedback } = await load();
    feedback("correct");
    expect(vibrate).toHaveBeenCalledWith(BUZZ.correct);
    expect(audio.made).toHaveLength(TONES.correct.length);
  });

  it("stays silent when Sound is off or the volume is 0", async () => {
    store.sound = "off";
    const { feedback } = await load();
    feedback("correct");
    expect(audio.FakeContext.instances).toBe(0);
    store.sound = "on";
    store.volume = "0";
    feedback("wrong");
    expect(audio.made).toHaveLength(0);
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
    store.sound = "off";
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
    store.sound = "off";
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
    expect(audio.made).toHaveLength(TONES.flip.length); // sound on by default
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

  it("the last answer of a round plays its verdict now and the win a beat later", async () => {
    vi.useFakeTimers();
    try {
      const { feedbackThenWin, WIN_DELAY_MS } = await load();
      feedbackThenWin("correct");
      expect(audio.made).toHaveLength(TONES.correct.length);
      expect(vibrate).toHaveBeenLastCalledWith(BUZZ.correct);
      vi.advanceTimersByTime(WIN_DELAY_MS);
      expect(audio.made).toHaveLength(TONES.correct.length + TONES.win.length);
      expect(vibrate).toHaveBeenLastCalledWith(BUZZ.win);
    } finally {
      vi.useRealTimers();
    }
  });

  it("routes every note through one soft-clipping bus, built once", async () => {
    const { feedback } = await load();
    feedback("win");
    feedback("correct");
    expect(audio.shapers).toHaveLength(1);
    expect(audio.shapers[0].curve).toBeInstanceOf(Float32Array);
    expect(audio.shapers[0].connect).toHaveBeenCalledWith(audio.FakeContext.all[0].destination);
  });

  it("lets go of each note's nodes when it ends", async () => {
    const { feedback } = await load();
    feedback("wrong");
    expect(audio.made).toHaveLength(TONES.wrong.length);
    for (const osc of audio.made) {
      expect(osc.onended).toBeTypeOf("function");
      osc.onended?.();
      expect(osc.disconnect).toHaveBeenCalled();
    }
  });
});
