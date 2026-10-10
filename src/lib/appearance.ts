// Look settings, saved per device. "theme" is light, dark or system ("Device"); "palette" is a colour theme
// or "custom" (with "fieldhex"); "accent" overrides the theme's highlight colour, or is "custom" (with
// "accenthex"); "text" scales the page text; "font" swaps the typeface; a stored "motion" of "calm" (from
// the retired Motion control) still switches animation off. The root layout's inline script applies these
// before first paint; the helpers below change them live.

export type Mode = "light" | "dark" | "system";
export type Palette = "bayview" | "maroon" | "forest" | "graphite";

export const MODES: { id: Mode; label: string }[] = [
  { id: "light", label: "Light" },
  { id: "dark", label: "Dark" },
  { id: "system", label: "Device" },
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

// Custom colours: a strict hex check before anything reaches a style, then text on top in white or near-black,
// whichever contrasts more (WCAG relative luminance). appearanceScript mirrors these; the tests compare them.
export const parseHex = (v: unknown): string | null => {
  if (typeof v !== "string") return null;
  const s = v.trim().toLowerCase();
  const short = /^#([0-9a-f])([0-9a-f])([0-9a-f])$/.exec(s);
  if (short) return `#${short[1]}${short[1]}${short[2]}${short[2]}${short[3]}${short[3]}`;
  return /^#[0-9a-f]{6}$/.test(s) ? s : null;
};

const channel = (hex: string, i: number) => {
  const x = parseInt(hex.slice(i, i + 2), 16) / 255;
  return x <= 0.04045 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4);
};
export const luminance = (hex: string) =>
  0.2126 * channel(hex, 1) + 0.7152 * channel(hex, 3) + 0.0722 * channel(hex, 5);

export const LIGHT_TEXT = "#ffffff";
export const DARK_TEXT = "#111111";
// Text colour for a background (a hex already through parseHex).
export const readableOn = (hex: string): string => {
  const l = luminance(hex);
  return 1.05 / (l + 0.05) >= (l + 0.05) / (luminance(DARK_TEXT) + 0.05) ? LIGHT_TEXT : DARK_TEXT;
};

// The inline CSS variables a custom theme (field) and highlight (accent) put on <html>.
export function customVars(field: string | null, accent: string | null): Record<string, string> {
  const out: Record<string, string> = {};
  if (field) {
    const on = readableOn(field);
    out["--field"] = field;
    out["--field-2"] = `color-mix(in oklab, ${field} 86%, ${on})`;
    out["--on-field"] = on;
    out["--on-field-2"] = `color-mix(in oklab, ${on} 72%, ${field})`;
    out["--on-field-danger"] = on === LIGHT_TEXT ? "#ffb4b4" : "#8f1010";
  }
  if (accent) {
    out["--you"] = accent;
    out["--on-you"] = readableOn(accent);
  }
  return out;
}
const CUSTOM_PROPS = ["--field", "--field-2", "--on-field", "--on-field-2", "--on-field-danger", "--you", "--on-you"];

export const DEFAULT_FIELD_HEX = "#1e3d62";
export const DEFAULT_ACCENT_HEX = "#7a1f2b";
export const readFieldHex = (): string => parseHex(stored("fieldhex")) ?? DEFAULT_FIELD_HEX;
export const readAccentHex = (): string => parseHex(stored("accenthex")) ?? DEFAULT_ACCENT_HEX;

// A named theme, or "custom" once a valid field colour has been saved.
export type ThemeChoice = Palette | "custom";
export const readPalette = (): ThemeChoice => {
  const v = stored("palette");
  if (v === "custom") return parseHex(stored("fieldhex")) ? "custom" : "bayview";
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

// Named themes go on data-palette; Bayview and a custom field colour leave it off.
export function applyPalette(palette: ThemeChoice) {
  if (palette === "bayview" || palette === "custom") delete document.documentElement.dataset.palette;
  else document.documentElement.dataset.palette = palette;
}

export function setPalette(palette: ThemeChoice) {
  store("palette", palette);
  applyPalette(palette);
  applyCustomColours();
  window.dispatchEvent(new Event("hosa:appearance"));
}

// Saves a custom theme colour and switches to it. Anything that isn't a hex colour is ignored.
export function setFieldHex(v: string): boolean {
  const hex = parseHex(v);
  if (!hex) return false;
  store("fieldhex", hex);
  setPalette("custom");
  return true;
}

// Inline variables on <html> for the custom colours in use; cleared when a named choice is picked.
export function applyCustomColours() {
  const style = document.documentElement.style;
  for (const p of CUSTOM_PROPS) style.removeProperty(p);
  const vars = customVars(
    readPalette() === "custom" ? readFieldHex() : null,
    readAccent() === "custom" ? readAccentHex() : null,
  );
  for (const [k, v] of Object.entries(vars)) style.setProperty(k, v);
}

// Highlight colour for "you", the active tab and badges. "theme" keeps the palette's own; "custom" uses
// the saved accenthex.
export type Accent = "theme" | "maroon" | "gold" | "teal" | "violet" | "ember" | "custom";
// The preset swatches ("custom" has its own picker).
export const ACCENTS: { id: Exclude<Accent, "custom">; label: string; swatch: string }[] = [
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

// "dyslexic" is Lexend; the stylesheet maps it to its family. A stored "readable" (a face since removed)
// is no longer a choice, so it reads as default.
export type Font = "default" | "dyslexic";
export const FONTS: { id: Font; label: string }[] = [
  { id: "default", label: "Default" },
  { id: "dyslexic", label: "Dyslexia-friendly" },
];


export const isAccent = (v: unknown): v is Accent =>
  v === "custom" || ACCENTS.some((a) => a.id === v);
export const isTextSize = (v: unknown): v is TextSize =>
  TEXT_SIZES.some((t) => t.id === v);
export const isFont = (v: unknown): v is Font => FONTS.some((f) => f.id === v);
export const isMotion = (v: unknown): v is Motion =>
  v === "full" || v === "calm";

export const readAccent = (): Accent => {
  const v = stored("accent");
  if (v === "custom") return parseHex(stored("accenthex")) ? "custom" : "theme";
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
// The bell's chime when a new notification arrives. On unless switched off.
export const parseNotifySound = (v: string | null): Toggle =>
  v === "off" ? "off" : "on";
export const readNotifySound = (): Toggle =>
  parseNotifySound(stored("notifysound"));
export function setNotifySound(v: Toggle) {
  store("notifysound", v);
  window.dispatchEvent(new Event("hosa:appearance"));
}

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
  applyCustomColours();
}

export function setAccent(v: Accent) {
  store("accent", v);
  setAttr("accent", v, "theme");
  applyCustomColours();
  window.dispatchEvent(new Event("hosa:appearance"));
}
// Saves a custom highlight colour and switches to it. Anything that isn't a hex colour is ignored.
export function setAccentHex(v: string): boolean {
  const hex = parseHex(v);
  if (!hex) return false;
  store("accenthex", hex);
  setAccent("custom");
  return true;
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
  "fieldhex",
  "accent",
  "accenthex",
  "text",
  "font",
  "motion",
  "navcase",
  "sound",
  "volume",
  "haptics",
  "notifysound",
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

// Inline in <head> so the right colours and sizes paint first. Mirrors applyMode, applyPalette, applyExtras
// and applyCustomColours (h is parseHex, o is readableOn, c is customVars). A stored "readable" font no
// longer matches, so it paints the default face.
// data-vibrate (canVibrate in feedback.ts) shows Settings' Haptics row before paint, so nothing shifts.
export const appearanceScript = `(function(){try{var d=document.documentElement,g=function(k){return localStorage.getItem(k)},t=g('theme'),p=g('palette'),a=g('accent'),x=g('text'),f=g('font'),m=g('motion'),n=g('navcase'),F=null,A=null,h=function(v){v=(v||'').trim().toLowerCase();var r=/^#([0-9a-f])([0-9a-f])([0-9a-f])$/.exec(v);if(r){v='#'+r[1]+r[1]+r[2]+r[2]+r[3]+r[3]}return /^#[0-9a-f]{6}$/.test(v)?v:null},L=function(c){var s=0,w=[0.2126,0.7152,0.0722];for(var i=0;i<3;i++){var y=parseInt(c.substr(1+2*i,2),16)/255;s+=w[i]*(y<=0.04045?y/12.92:Math.pow((y+0.055)/1.055,2.4))}return s},o=function(c){var l=L(c);return 1.05/(l+0.05)>=(l+0.05)/(L('${DARK_TEXT}')+0.05)?'${LIGHT_TEXT}':'${DARK_TEXT}'},S=function(k,v){d.style.setProperty(k,v)};if(t!=='light'&&t!=='dark'){t=matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light'}d.dataset.theme=t;if(p==='maroon'||p==='forest'||p==='graphite'){d.dataset.palette=p}if(p==='custom'){F=h(g('fieldhex'))}if(/^(maroon|gold|teal|violet|ember)$/.test(a||'')){d.dataset.accent=a}if(a==='custom'){A=h(g('accenthex'));if(A){d.dataset.accent='custom'}}if(F){var N=o(F);S('--field',F);S('--field-2','color-mix(in oklab, '+F+' 86%, '+N+')');S('--on-field',N);S('--on-field-2','color-mix(in oklab, '+N+' 72%, '+F+')');S('--on-field-danger',N==='${LIGHT_TEXT}'?'#ffb4b4':'#8f1010')}if(A){S('--you',A);S('--on-you',o(A))}if(x==='large'||x==='larger'){d.dataset.text=x}if(f==='dyslexic'){d.dataset.font=f}if(m==='calm'){d.dataset.motion='calm'}if(n==='title'){d.dataset.navcase='title'}if(typeof navigator!=='undefined'&&typeof navigator.vibrate==='function'&&matchMedia('(pointer: coarse)').matches){d.dataset.vibrate=''}}catch(e){}})()`;
