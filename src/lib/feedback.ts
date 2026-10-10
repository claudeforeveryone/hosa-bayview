import { readHaptics, readSound } from "@/lib/appearance";

// Short sound and buzz for a moment that matters: a practice answer landing, a card turning over, a test
// going in, a battle won. Both follow Settings > Look (Sound off by default, Haptics on). Tones are synthesised
// with WebAudio, so there are no audio files; each stays under 150 ms and quiet.
export type FeedbackKind = "correct" | "wrong" | "flip" | "submit" | "win";

type Note = {
  at: number; // seconds from the start
  dur: number; // seconds
  freq: number; // Hz at the start
  to?: number; // Hz at the end, for a slide
  type: OscillatorType;
  gain: number; // peak, 0 to 1
};

export const TONES: Record<FeedbackKind, Note[]> = {
  // Two notes up a fourth: bright, quick.
  correct: [
    { at: 0, dur: 0.06, freq: 660, type: "sine", gain: 0.07 },
    { at: 0.055, dur: 0.08, freq: 880, type: "sine", gain: 0.07 },
  ],
  // One low note sliding down: soft, not a buzzer.
  wrong: [
    { at: 0, dur: 0.13, freq: 240, to: 170, type: "triangle", gain: 0.08 },
  ],
  // A short tick.
  flip: [
    { at: 0, dur: 0.035, freq: 1250, to: 900, type: "triangle", gain: 0.035 },
  ],
  // A settled two-note close.
  submit: [
    { at: 0, dur: 0.06, freq: 523, type: "sine", gain: 0.06 },
    { at: 0.06, dur: 0.085, freq: 784, type: "sine", gain: 0.06 },
  ],
  // Three notes up the chord.
  win: [
    { at: 0, dur: 0.05, freq: 523, type: "triangle", gain: 0.06 },
    { at: 0.045, dur: 0.05, freq: 659, type: "triangle", gain: 0.06 },
    { at: 0.09, dur: 0.06, freq: 1047, type: "triangle", gain: 0.06 },
  ],
};

// Vibration patterns in ms (buzz, pause, buzz...). Kept short so they read as a tap, not an alarm.
export const BUZZ: Record<FeedbackKind, number[]> = {
  correct: [14],
  wrong: [24, 50, 24],
  flip: [8],
  submit: [18],
  win: [16, 40, 16, 40, 32],
};

type AudioCtor = new () => AudioContext;
let context: AudioContext | null = null;

// Before the first tap or key on the page, browsers refuse to start audio and log a warning; skip instead.
const neverActive = () =>
  (navigator as { userActivation?: { hasBeenActive: boolean } }).userActivation?.hasBeenActive === false;

function audioContext(): AudioContext | null {
  if (context) return context;
  if (neverActive()) return null;
  const w = window as unknown as {
    AudioContext?: AudioCtor;
    webkitAudioContext?: AudioCtor;
  };
  const Ctor = w.AudioContext ?? w.webkitAudioContext;
  if (!Ctor) return null;
  try {
    context = new Ctor();
  } catch {
    return null;
  }
  return context;
}

// "suspended" before a gesture, "interrupted" on iOS after a call or backgrounding.
function wake(ctx: AudioContext) {
  const state = ctx.state as string;
  if (state !== "running" && state !== "closed") void ctx.resume().catch(() => {});
}

// Call from the tap or key handler when the feedback itself comes later (after a server round trip):
// browsers only let audio start inside a user gesture, so this creates or wakes the context then.
export function primeFeedback() {
  if (typeof window === "undefined" || readSound() !== "on") return;
  const ctx = audioContext();
  if (ctx) wake(ctx);
}

function play(notes: Note[]) {
  const ctx = audioContext();
  if (!ctx) return;
  wake(ctx);
  const start = ctx.currentTime + 0.005;
  for (const n of notes) {
    const t = start + n.at;
    const osc = ctx.createOscillator();
    const amp = ctx.createGain();
    osc.type = n.type;
    osc.frequency.setValueAtTime(n.freq, t);
    if (n.to) osc.frequency.exponentialRampToValueAtTime(n.to, t + n.dur);
    // A fast attack and an exponential tail, so nothing clicks.
    amp.gain.setValueAtTime(0.0001, t);
    amp.gain.exponentialRampToValueAtTime(n.gain, t + 0.006);
    amp.gain.exponentialRampToValueAtTime(0.0001, t + n.dur);
    osc.connect(amp);
    amp.connect(ctx.destination);
    osc.start(t);
    osc.stop(t + n.dur + 0.01);
  }
}

// Haptics are for touch devices that can vibrate. Desktop Chrome has navigator.vibrate as a no-op, so a
// coarse pointer is required too. The head script (appearanceScript) mirrors this for Settings.
export const canVibrate = () =>
  typeof navigator !== "undefined" &&
  typeof (navigator as { vibrate?: unknown }).vibrate === "function" &&
  typeof window !== "undefined" &&
  typeof window.matchMedia === "function" &&
  window.matchMedia("(pointer: coarse)").matches;

function buzz(pattern: number[]) {
  if (!canVibrate() || neverActive()) return;
  try {
    navigator.vibrate(pattern);
  } catch {}
}

// `sound: false` for moments that aren't a tap (a timer running out): no tone, the buzz still comes.
export function feedback(kind: FeedbackKind, { sound = true }: { sound?: boolean } = {}) {
  if (typeof window === "undefined") return;
  if (readHaptics() === "on") buzz(BUZZ[kind]);
  if (sound && readSound() === "on") {
    try {
      play(TONES[kind]);
    } catch {}
  }
}
