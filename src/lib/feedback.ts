import { readHaptics, readSound, readVolume, volumeGain } from "@/lib/appearance";

// Short sound and buzz for a moment that matters: a practice answer landing, a card turning over, a test
// going in, a battle won. Both follow Settings > Sound (both on by default, with a volume for sound). Tones are
// synthesised with WebAudio, so there are no audio files. Meant to feel like a small reward, game style:
// a quick rising "ding-ding" for right, a soft low "bwomp" for wrong (never a buzzer), a crisp pop for taps,
// and fanfares that grow with the moment (a finished test, then a won round).
export type FeedbackKind = "correct" | "wrong" | "flip" | "submit" | "win" | "notify";

export type Note = {
  at: number; // seconds from the start
  dur: number; // seconds, attack to silence
  freq: number; // Hz once the scoop (if any) has landed
  to?: number; // Hz at the end, for a slide over the whole note
  scoop?: number; // start at freq * scoop and glide to freq in SCOOP_S, a tiny bend into the note
  type: OscillatorType;
  gain: number; // peak at the default volume, 0 to 1
  attack?: number; // seconds to the peak, default ATTACK_S
  hold?: number; // seconds the note sustains (sagging a little) before it rings out
  lowpass?: number; // Hz, muffles the note
};

export const ATTACK_S = 0.004;
export const SCOOP_S = 0.03;

// Equal-tempered pitches used below.
const C5 = 523.25, E5 = 659.25, G5 = 783.99;
const A5 = 880, C6 = 1046.5, E6 = 1318.51, A6 = 1760;
const C7 = 2093, E7 = 2637.02, G7 = 3135.96, C8 = 4186.01;

// A bell-ish voice: a triangle fundamental with a quieter sine an octave up that fades first (the "tine").
const bell = (at: number, freq: number, dur: number, gain: number, extra: Partial<Note> = {}): Note[] => [
  { at, dur, freq, type: "triangle", gain, scoop: 0.985, ...extra },
  { at, dur: Math.min(dur, 0.09), freq: freq * 2, type: "sine", gain: gain * 0.3 },
];

// A sparkle: a tiny high sine, sprinkled over the end of a fanfare.
const sparkle = (at: number, freq: number, gain = 0.022): Note => ({ at, dur: 0.16, freq, type: "sine", gain });

export const TONES: Record<FeedbackKind, Note[]> = {
  // Ding-ding: two quick bell notes up a fourth (E6 to A6), each scooping up into pitch, the second one
  // ringing out with a soft A5 underneath for body. About a third of a second.
  correct: [
    ...bell(0, E6, 0.13, 0.11),
    ...bell(0.075, A6, 0.27, 0.12),
    { at: 0.075, dur: 0.22, freq: A5, type: "sine", gain: 0.04 },
  ],
  // Bwomp: two low notes stepping down (E4 to B3), each drooping in pitch, through a lowpass so it's round
  // and muffled. Triangle, so a phone speaker (which can't play much below 300 Hz) still hears its overtones.
  wrong: [
    { at: 0, dur: 0.11, freq: 329.63, to: 311.13, type: "triangle", gain: 0.15, attack: 0.006, lowpass: 1400 },
    { at: 0.1, dur: 0.19, freq: 246.94, to: 207.65, type: "triangle", gain: 0.16, attack: 0.008, lowpass: 1100 },
  ],
  // Pop: a quick upward sine blip with a crisp click on top, like a bubble or a card snapping over.
  flip: [
    { at: 0, dur: 0.05, freq: 480, to: 1150, type: "sine", gain: 0.13, attack: 0.002 },
    { at: 0, dur: 0.022, freq: 2400, type: "triangle", gain: 0.025, attack: 0.001 },
  ],
  // Test in: a quick C major run (C5 E5 G5) landing on a held C6 + E6 with a two-note sparkle on top.
  submit: [
    ...bell(0, C5, 0.1, 0.09),
    ...bell(0.055, E5, 0.1, 0.09),
    ...bell(0.11, G5, 0.1, 0.09),
    { at: 0.165, dur: 0.5, freq: C6, type: "triangle", gain: 0.1, scoop: 0.985, hold: 0.12 },
    { at: 0.165, dur: 0.45, freq: E6, type: "triangle", gain: 0.07, scoop: 0.985, hold: 0.1 },
    sparkle(0.2, C7),
    sparkle(0.27, G7, 0.018),
  ],
  // Notification: a bright "ba-ding" up a fifth (A5 to E6), the second note ringing. Lively but short.
  notify: [
    ...bell(0, A5, 0.12, 0.09),
    ...bell(0.08, E6, 0.3, 0.1),
  ],
  // Round won: a faster, longer run up two octaves (G4 C5 E5 G5 C6) into a full held C major chord
  // (C5 G5 C6 E6) with a sparkle climbing C7 E7 G7 C8 over it. The biggest cue, about 1.15 s.
  win: [
    ...bell(0, 392, 0.1, 0.08),
    ...bell(0.06, C5, 0.1, 0.08),
    ...bell(0.12, E5, 0.1, 0.08),
    ...bell(0.18, G5, 0.1, 0.085),
    ...bell(0.24, C6, 0.12, 0.09),
    { at: 0.3, dur: 0.85, freq: C5, type: "triangle", gain: 0.05, hold: 0.3 },
    { at: 0.3, dur: 0.85, freq: G5, type: "triangle", gain: 0.05, hold: 0.3, scoop: 0.985 },
    { at: 0.3, dur: 0.85, freq: C6, type: "triangle", gain: 0.055, hold: 0.3, scoop: 0.985 },
    { at: 0.3, dur: 0.8, freq: E6, type: "triangle", gain: 0.045, hold: 0.25, scoop: 0.985 },
    sparkle(0.34, C7),
    sparkle(0.42, E7),
    sparkle(0.5, G7),
    sparkle(0.58, C8, 0.016),
  ],
};

// When a cue ends, in seconds.
export const toneLength = (notes: Note[]) => Math.max(...notes.map((n) => n.at + n.dur));

// A note's loudness at `t` seconds into the cue, at the default volume: the same envelope play() schedules
// (exponential ramps from near silence to the peak, through the hold's sag, back to near silence).
const FLOOR = 0.0001;
const expRamp = (from: number, to: number, f: number) => from * (to / from) ** Math.min(1, Math.max(0, f));
export function envelopeAt(n: Note, t: number): number {
  const local = t - n.at;
  if (local < 0 || local > n.dur) return 0;
  const attack = n.attack ?? ATTACK_S;
  if (local <= attack) return expRamp(FLOOR, n.gain, local / attack);
  const held = attack + (n.hold ?? 0);
  if (local <= held) return expRamp(n.gain, n.gain * 0.6, (local - attack) / (n.hold ?? 1));
  const top = n.hold ? n.gain * 0.6 : n.gain;
  return expRamp(top, FLOOR, (local - held) / (n.dur - held));
}

// The loudest a cue gets at the default volume, as if every note's waves lined up (they don't, so real peaks
// are lower). Tests keep it low enough that volume 100 (x4) stays inside the clipper's headroom.
export function peakLevel(notes: Note[]): number {
  let worst = 0;
  const end = toneLength(notes);
  for (let t = 0; t <= end; t += 0.001) {
    worst = Math.max(worst, notes.reduce((a, n) => a + envelopeAt(n, t), 0));
  }
  return worst;
}

// Vibration patterns in ms (buzz, pause, buzz...). Kept short so they read as a tap, not an alarm.
export const BUZZ: Record<FeedbackKind, number[]> = {
  correct: [10, 45, 16],
  wrong: [24, 50, 24],
  flip: [8],
  submit: [14, 40, 24],
  win: [16, 40, 16, 40, 32],
  notify: [12, 60, 12],
};

// Soft clipper for the master bus. Straight through up to KNEE, so at normal volumes nothing changes, then
// rounds off and never passes 1. Volume 100 (x4) on the busiest chord then saturates gently instead of
// cracking. HEADROOM: the curve covers -2 to 2, since a WaveShaper only reads inputs from -1 to 1.
const KNEE = 0.8;
export const HEADROOM = 2;
export function softClip(x: number): number {
  const a = Math.abs(x);
  if (a <= KNEE) return x;
  return Math.sign(x) * (KNEE + (1 - KNEE) * Math.tanh((a - KNEE) / (1 - KNEE)));
}
export function clipCurve(points = 1025): Float32Array<ArrayBuffer> {
  const curve = new Float32Array(points);
  for (let i = 0; i < points; i++) curve[i] = softClip(((i / (points - 1)) * 2 - 1) * HEADROOM);
  return curve;
}

type AudioCtor = new () => AudioContext;
let context: AudioContext | null = null;
let master: AudioNode | null = null;

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

// Every note goes through one bus: a gain of 1/HEADROOM into the soft clipper, which undoes it below the
// knee. Built once per context; without WaveShaper support notes go straight out.
function bus(ctx: AudioContext): AudioNode {
  if (master) return master;
  try {
    const pad = ctx.createGain();
    pad.gain.value = 1 / HEADROOM;
    const shaper = ctx.createWaveShaper();
    shaper.curve = clipCurve();
    shaper.oversample = "2x";
    pad.connect(shaper);
    shaper.connect(ctx.destination);
    master = pad;
  } catch {
    master = ctx.destination;
  }
  return master;
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

// Settings > Sound > Volume. The tones above are tuned for the default level (x1).
function play(notes: Note[]) {
  const scale = volumeGain(readVolume());
  if (scale <= 0) return;
  const ctx = audioContext();
  if (!ctx) return;
  wake(ctx);
  const out = bus(ctx);
  const start = ctx.currentTime + 0.005;
  for (const n of notes) {
    const t = start + n.at;
    const end = t + n.dur;
    const peak = n.gain * scale;
    const attack = n.attack ?? ATTACK_S;
    const osc = ctx.createOscillator();
    const amp = ctx.createGain();
    osc.type = n.type;
    if (n.scoop) {
      osc.frequency.setValueAtTime(n.freq * n.scoop, t);
      osc.frequency.exponentialRampToValueAtTime(n.freq, t + SCOOP_S);
    } else {
      osc.frequency.setValueAtTime(n.freq, t);
    }
    if (n.to) osc.frequency.exponentialRampToValueAtTime(n.to, end);
    // A fast attack, an optional held body that sags a little, then an exponential tail, so nothing clicks.
    amp.gain.setValueAtTime(0.0001, t);
    amp.gain.exponentialRampToValueAtTime(peak, t + attack);
    if (n.hold) amp.gain.exponentialRampToValueAtTime(peak * 0.6, t + attack + n.hold);
    amp.gain.exponentialRampToValueAtTime(0.0001, end);
    let filter: BiquadFilterNode | null = null;
    if (n.lowpass) {
      filter = ctx.createBiquadFilter();
      filter.type = "lowpass";
      filter.frequency.value = n.lowpass;
      filter.Q.value = 0.7;
      osc.connect(filter);
      filter.connect(amp);
    } else {
      osc.connect(amp);
    }
    amp.connect(out);
    // Let go of the nodes once the note is done, so a long session doesn't pile them up.
    osc.onended = () => {
      osc.disconnect();
      filter?.disconnect();
      amp.disconnect();
    };
    osc.start(t);
    osc.stop(end + 0.01);
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

// When the last big cue (a win or a hand-in) went off, played or not, so a cue that follows soon after (the
// lucky bonus band) can stay quiet instead of stacking a second fanfare or sounding after a timer ran out.
let lastBigCue = 0;
export function msSinceBigCue(now = Date.now()): number {
  return now - lastBigCue;
}

// `sound: false` for moments that aren't a tap (a timer running out): no tone, the buzz still comes.
export function feedback(kind: FeedbackKind, { sound = true }: { sound?: boolean } = {}) {
  if (typeof window === "undefined") return;
  if (kind === "win" || kind === "submit") lastBigCue = Date.now();
  if (readHaptics() === "on") buzz(BUZZ[kind]);
  if (sound && readSound() === "on") {
    try {
      play(TONES[kind]);
    } catch {}
  }
}

// How long the round's closing fanfare waits after the last verdict, so the two read as a pair, not a clash:
// it starts once the ding's second note (or the bwomp's) has landed.
export const WIN_DELAY_MS = 300;

// The last answer of a round: its verdict, then the win. Audio was woken by the tap that called this, so the
// delayed fanfare still plays.
export function feedbackThenWin(kind: FeedbackKind) {
  feedback(kind);
  if (typeof window === "undefined") return;
  // Counts as a big cue from now, so a bonus band that lands before the fanfare doesn't play its own on top.
  lastBigCue = Date.now() + WIN_DELAY_MS;
  setTimeout(() => feedback("win"), WIN_DELAY_MS);
}
