// Look settings, saved per device. "theme" is light, dark or system; "palette" is a colour theme.
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

// Inline in <head> so the right colours paint first. Mirrors applyMode and setPalette.
export const appearanceScript = `(function(){try{var d=document.documentElement,t=localStorage.getItem('theme'),p=localStorage.getItem('palette');if(t!=='light'&&t!=='dark'){t=matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light'}d.dataset.theme=t;if(p==='maroon'||p==='forest'||p==='graphite'){d.dataset.palette=p}}catch(e){}})()`;
