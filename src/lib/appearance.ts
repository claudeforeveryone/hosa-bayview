// Look settings, saved per device. "theme" is light, dark or system; "palette" is a colour theme; "accent"
// overrides the theme's highlight colour; "text" scales the page; "font" swaps the typeface; "motion" can switch animation off.
// The root layout's inline script applies both before first paint; these helpers change them live.

export type Mode = "light" | "dark" | "system";
export type Palette = "bayview" | "maroon" | "forest" | "graphite";

export const MODES: { id: Mode; label: string }[] = [
  { id: "light", label: "Light" },
  { id: "dark", label: "Dark" },
  { id: "system", label: "Auto" },
];

// Swatch colours are each theme's field and accent, for the picker only.
export const PALETTES: {
  id: Palette;
  label: string;
  field: string;
  accent: string;
}[] = [
  { id: "bayview", label: "Bayview", field: "#1e3d62", accent: "#7a1f2b" },
  { id: "maroon", label: "Maroon", field: "#6a1a26", accent: "#1e3d62" },
  { id: "forest", label: "Forest", field: "#1d4a33", accent: "#7a1f2b" },
  { id: "graphite", label: "Graphite", field: "#1f1f1f", accent: "#7a1f2b" },
];

export const isMode = (v: unknown): v is Mode =>
  v === "light" || v === "dark" || v === "system";
export const isPalette = (v: unknown): v is Palette =>
  PALETTES.some((p) => p.id === v);

function stored(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function store(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {}
}

export const readMode = (): Mode => {
  const v = stored("theme");
  return isMode(v) ? v : "system";
};

export const readPalette = (): Palette => {
  const v = stored("palette");
  return isPalette(v) ? v : "bayview";
};

const systemDark = () =>
  window.matchMedia("(prefers-color-scheme: dark)").matches;

// Puts the resolved light/dark on <html>. "system" follows the device.
export function applyMode(mode: Mode) {
  document.documentElement.dataset.theme =
    mode === "system" ? (systemDark() ? "dark" : "light") : mode;
}

export function setMode(mode: Mode) {
  store("theme", mode);
  applyMode(mode);
  window.dispatchEvent(new Event("hosa:appearance"));
}

export function setPalette(palette: Palette) {
  store("palette", palette);
  if (palette === "bayview") delete document.documentElement.dataset.palette;
  else document.documentElement.dataset.palette = palette;
  window.dispatchEvent(new Event("hosa:appearance"));
}

// Highlight colour for "you", the active tab and badges. "theme" keeps the palette's own.
export type Accent = "theme" | "maroon" | "gold" | "teal" | "violet" | "ember";
export const ACCENTS: { id: Accent; label: string; swatch: string }[] = [
  { id: "theme", label: "Theme", swatch: "" },
  { id: "maroon", label: "Maroon", swatch: "#7a1f2b" },
  { id: "gold", label: "Gold", swatch: "#a8781a" },
  { id: "teal", label: "Teal", swatch: "#0f6b66" },
  { id: "violet", label: "Violet", swatch: "#5a3594" },
  { id: "ember", label: "Ember", swatch: "#b2471a" },
];

export type TextSize = "standard" | "large" | "larger";
export const TEXT_SIZES: { id: TextSize; label: string }[] = [
  { id: "standard", label: "Aa" },
  { id: "large", label: "Aa+" },
  { id: "larger", label: "Aa++" },
];

export type Motion = "full" | "calm";

// "readable" is Atkinson Hyperlegible, "dyslexic" is Lexend. The stylesheet maps each to its family.
export type Font = "default" | "readable" | "dyslexic";
export const FONTS: { id: Font; label: string }[] = [
  { id: "default", label: "Default" },
  { id: "readable", label: "Readable" },
  { id: "dyslexic", label: "Dyslexia-friendly" },
];

export const isAccent = (v: unknown): v is Accent =>
  ACCENTS.some((a) => a.id === v);
export const isTextSize = (v: unknown): v is TextSize =>
  TEXT_SIZES.some((t) => t.id === v);
export const isFont = (v: unknown): v is Font => FONTS.some((f) => f.id === v);
export const isMotion = (v: unknown): v is Motion =>
  v === "full" || v === "calm";

export const readAccent = (): Accent => {
  const v = stored("accent");
  return isAccent(v) ? v : "theme";
};
export const readTextSize = (): TextSize => {
  const v = stored("text");
  return isTextSize(v) ? v : "standard";
};
export const readFont = (): Font => {
  const v = stored("font");
  return isFont(v) ? v : "default";
};
export const readMotion = (): Motion =>
  stored("motion") === "calm" ? "calm" : "full";

// Sidebar and drawer labels: "upper" is the shipped all-caps, "title" shows them as written ("Announcements").
export type NavCase = "upper" | "title";
export const NAV_CASES: { id: NavCase; label: string }[] = [
  { id: "upper", label: "UPPERCASE" },
  { id: "title", label: "Capitalized" },
];
export const readNavCase = (): NavCase =>
  stored("navcase") === "title" ? "title" : "upper";

// Feedback on answers, flips and submits (src/lib/feedback.ts). Sound and haptics are on unless switched
// off; haptics only do anything where the device can vibrate. Neither touches the page's look.
export type Toggle = "on" | "off";
export const parseSound = (v: string | null): Toggle =>
  v === "off" ? "off" : "on";
export const parseHaptics = (v: string | null): Toggle =>
  v === "off" ? "off" : "on";
export const readSound = (): Toggle => parseSound(stored("sound"));
export const readHaptics = (): Toggle => parseHaptics(stored("haptics"));

// Sound effect volume, 0 to 100 in steps of 10. Scales every tone in feedback.ts.
export const DEFAULT_VOLUME = 60;
export const parseVolume = (v: string | null): number => {
  const n = Number(v);
  return v !== null && v.trim() !== "" && Number.isFinite(n)
    ? Math.min(100, Math.max(0, Math.round(n / 10) * 10))
    : DEFAULT_VOLUME;
};
export const readVolume = (): number => parseVolume(stored("volume"));

// Defaults leave the attribute off, so the stylesheet's base look applies.
function setAttr(name: string, value: string, fallback: string) {
  const d = document.documentElement;
  if (value === fallback) d.removeAttribute(`data-${name}`);
  else d.setAttribute(`data-${name}`, value);
}

export function applyExtras() {
  setAttr("accent", readAccent(), "theme");
  setAttr("text", readTextSize(), "standard");
  setAttr("font", readFont(), "default");
  setAttr("motion", readMotion(), "full");
  setAttr("navcase", readNavCase(), "upper");
}

export function setAccent(v: Accent) {
  store("accent", v);
  setAttr("accent", v, "theme");
  window.dispatchEvent(new Event("hosa:appearance"));
}
export function setTextSize(v: TextSize) {
  store("text", v);
  setAttr("text", v, "standard");
  window.dispatchEvent(new Event("hosa:appearance"));
}
export function setFont(v: Font) {
  store("font", v);
  setAttr("font", v, "default");
  window.dispatchEvent(new Event("hosa:appearance"));
}
export function setMotion(v: Motion) {
  store("motion", v);
  setAttr("motion", v, "full");
  window.dispatchEvent(new Event("hosa:appearance"));
}

export function setNavCase(v: NavCase) {
  store("navcase", v);
  setAttr("navcase", v, "upper");
  window.dispatchEvent(new Event("hosa:appearance"));
}

export function setSound(v: Toggle) {
  store("sound", v);
  window.dispatchEvent(new Event("hosa:appearance"));
}
export function setVolume(v: number) {
  store("volume", String(parseVolume(String(v))));
  window.dispatchEvent(new Event("hosa:appearance"));
}
export function setHaptics(v: Toggle) {
  store("haptics", v);
  window.dispatchEvent(new Event("hosa:appearance"));
}

// Every per-device setting, for the reset and for syncing a change made in another tab.
export const LOOK_KEYS = [
  "theme",
  "palette",
  "accent",
  "text",
  "font",
  "motion",
  "navcase",
  "sound",
  "volume",
  "haptics",
];

// Back to the shipped look on this device.
export function resetAppearance() {
  for (const k of LOOK_KEYS) {
    try {
      localStorage.removeItem(k);
    } catch {}
  }
  applyMode("system");
  delete document.documentElement.dataset.palette;
  applyExtras();
  window.dispatchEvent(new Event("hosa:appearance"));
}

// Inline in <head> so the right colours and sizes paint first. Mirrors applyMode, setPalette and applyExtras.
// data-vibrate (canVibrate in feedback.ts) shows Settings' Haptics row before paint, so nothing shifts.
export const appearanceScript = `(function(){try{var d=document.documentElement,g=function(k){return localStorage.getItem(k)},t=g('theme'),p=g('palette'),a=g('accent'),x=g('text'),f=g('font'),m=g('motion'),n=g('navcase');if(t!=='light'&&t!=='dark'){t=matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light'}d.dataset.theme=t;if(p==='maroon'||p==='forest'||p==='graphite'){d.dataset.palette=p}if(/^(maroon|gold|teal|violet|ember)$/.test(a||'')){d.dataset.accent=a}if(x==='large'||x==='larger'){d.dataset.text=x}if(f==='readable'||f==='dyslexic'){d.dataset.font=f}if(m==='calm'){d.dataset.motion='calm'}if(n==='title'){d.dataset.navcase='title'}if(typeof navigator!=='undefined'&&typeof navigator.vibrate==='function'&&matchMedia('(pointer: coarse)').matches){d.dataset.vibrate=''}}catch(e){}})()`;
