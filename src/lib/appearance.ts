// Look settings, saved per device. "theme" is light, dark or system; "palette" is a colour theme; "accent"
// overrides the theme's highlight colour; "text" scales the page; "motion" can switch animation off.
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

export const isAccent = (v: unknown): v is Accent => ACCENTS.some((a) => a.id === v);
export const isTextSize = (v: unknown): v is TextSize => TEXT_SIZES.some((t) => t.id === v);
export const isMotion = (v: unknown): v is Motion => v === "full" || v === "calm";

export const readAccent = (): Accent => {
  const v = stored("accent");
  return isAccent(v) ? v : "theme";
};
export const readTextSize = (): TextSize => {
  const v = stored("text");
  return isTextSize(v) ? v : "standard";
};
export const readMotion = (): Motion => (stored("motion") === "calm" ? "calm" : "full");

// Defaults leave the attribute off, so the stylesheet's base look applies.
function setAttr(name: string, value: string, fallback: string) {
  const d = document.documentElement;
  if (value === fallback) d.removeAttribute(`data-${name}`);
  else d.setAttribute(`data-${name}`, value);
}

export function applyExtras() {
  setAttr("accent", readAccent(), "theme");
  setAttr("text", readTextSize(), "standard");
  setAttr("motion", readMotion(), "full");
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
export function setMotion(v: Motion) {
  store("motion", v);
  setAttr("motion", v, "full");
  window.dispatchEvent(new Event("hosa:appearance"));
}

// Back to the shipped look on this device.
export function resetAppearance() {
  for (const k of ["theme", "palette", "accent", "text", "motion"]) {
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
export const appearanceScript = `(function(){try{var d=document.documentElement,g=function(k){return localStorage.getItem(k)},t=g('theme'),p=g('palette'),a=g('accent'),x=g('text'),m=g('motion');if(t!=='light'&&t!=='dark'){t=matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light'}d.dataset.theme=t;if(p==='maroon'||p==='forest'||p==='graphite'){d.dataset.palette=p}if(/^(maroon|gold|teal|violet|ember)$/.test(a||'')){d.dataset.accent=a}if(x==='large'||x==='larger'){d.dataset.text=x}if(m==='calm'){d.dataset.motion='calm'}}catch(e){}})()`;
