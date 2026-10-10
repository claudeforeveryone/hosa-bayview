"use client";

import { Check, RotateCcw } from "lucide-react";
import { useEffect, useSyncExternalStore, type CSSProperties } from "react";
import {
  ACCENTS,
  DEFAULT_VOLUME,
  FONTS,
  LOOK_KEYS,
  MODES,
  NAV_CASES,
  PALETTES,
  TEXT_SIZES,
  applyExtras,
  applyMode,
  readAccent,
  readFont,
  readHaptics,
  readMode,
  readMotion,
  readNavCase,
  readPalette,
  readSound,
  readTextSize,
  readVolume,
  resetAppearance,
  setAccent,
  setFont,
  setHaptics,
  setMode,
  setMotion,
  setNavCase,
  setPalette,
  setSound,
  setTextSize,
  setVolume,
  type Accent,
  type Font,
  type Mode,
  type Motion,
  type NavCase,
  type Palette,
  type TextSize,
  type Toggle,
} from "@/lib/appearance";
import { feedback } from "@/lib/feedback";

const TOGGLES: { id: Toggle; label: string }[] = [
  { id: "off", label: "Off" },
  { id: "on", label: "On" },
];

function subscribe(onChange: () => void) {
  window.addEventListener("hosa:appearance", onChange);
  window.addEventListener("storage", onChange);
  return () => {
    window.removeEventListener("hosa:appearance", onChange);
    window.removeEventListener("storage", onChange);
  };
}

function applyPalette(palette: Palette) {
  if (palette === "bayview") delete document.documentElement.dataset.palette;
  else document.documentElement.dataset.palette = palette;
}

// In the root layout. On Auto, follows the device when it switches between light and dark, and picks up a
// change made in another tab.
export function AppearanceSync() {
  useEffect(() => {
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const onScheme = () => {
      if (readMode() === "system") applyMode("system");
    };
    const onStorage = (e: StorageEvent) => {
      if (e.key === null || LOOK_KEYS.includes(e.key)) {
        applyMode(readMode());
        applyPalette(readPalette());
        applyExtras();
      }
    };
    media.addEventListener("change", onScheme);
    window.addEventListener("storage", onStorage);
    return () => {
      media.removeEventListener("change", onScheme);
      window.removeEventListener("storage", onStorage);
    };
  }, []);
  return null;
}

// Each option is set in its own face. The variables come from the root layout's next/font loaders.
const FONT_FAMILIES: Record<Font, string> = {
  default: "var(--font-barlow), system-ui, sans-serif",
  readable: "var(--font-atkinson), system-ui, sans-serif",
  dyslexic: "var(--font-lexend), system-ui, sans-serif",
};

const legend = "caps mb-2 text-[14px] text-ink-2";

// A row of square segments backed by native radios.
function Segments<T extends string>({
  name,
  label,
  options,
  value,
  onPick,
}: {
  name: string;
  label: string;
  options: { id: T; label: string; className?: string; style?: CSSProperties }[];
  value: T;
  onPick: (v: T) => void;
}) {
  return (
    <fieldset>
      <legend className={legend}>{label}</legend>
      <div className="grid auto-cols-fr grid-flow-col border border-rule-strong">
        {options.map((o) => (
          <label key={o.id} className="relative border-r border-rule-strong last:border-r-0">
            <input
              type="radio"
              name={name}
              value={o.id}
              checked={o.id === value}
              onChange={() => onPick(o.id)}
              className="peer sr-only"
            />
            <span
              className={`caps step flex h-12 cursor-pointer items-center justify-center text-[16px] text-ink peer-checked:bg-ink peer-checked:text-ground peer-focus-visible:outline-2 peer-focus-visible:-outline-offset-4 peer-focus-visible:outline-ground hover:bg-band peer-checked:hover:bg-ink ${o.className ?? ""}`}
              style={o.style}
            >
              {o.label}
            </span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}

// Native radios, so Tab lands on the group once and the arrow keys move the choice.
export function LookSection() {
  const mode = useSyncExternalStore<Mode>(subscribe, readMode, () => "system");
  const palette = useSyncExternalStore<Palette>(
    subscribe,
    readPalette,
    () => "bayview",
  );
  const accent = useSyncExternalStore<Accent>(subscribe, readAccent, () => "theme");
  const text = useSyncExternalStore<TextSize>(subscribe, readTextSize, () => "standard");
  const font = useSyncExternalStore<Font>(subscribe, readFont, () => "default");
  const motion = useSyncExternalStore<Motion>(subscribe, readMotion, () => "full");
  const navCase = useSyncExternalStore<NavCase>(subscribe, readNavCase, () => "upper");
  const sound = useSyncExternalStore<Toggle>(subscribe, readSound, () => "on");
  const volume = useSyncExternalStore<number>(subscribe, readVolume, () => DEFAULT_VOLUME);
  const haptics = useSyncExternalStore<Toggle>(subscribe, readHaptics, () => "on");
  const themeAccent = PALETTES.find((p) => p.id === palette)?.accent ?? "#7a1f2b";

  return (
    <section
      aria-labelledby="look-h"
      className="grid grid-cols-1 gap-5 border-t border-rule pt-6 lg:grid-cols-[16rem_minmax(0,32rem)]"
    >
      <h2
        id="look-h"
        className="font-display text-[clamp(1.75rem,5vw,2.25rem)] leading-none font-bold uppercase"
      >
        Look
      </h2>
      <div className="grid gap-6">
        <Preview />
        <Segments name="look-mode" label="Mode" options={MODES} value={mode} onPick={setMode} />
        <fieldset className="grid grid-cols-4 gap-2 sm:gap-3">
          <legend className={legend}>Theme</legend>
          {PALETTES.map((p) => {
            const on = p.id === palette;
            return (
              <label key={p.id} className="group grid cursor-pointer gap-2">
                <input
                  type="radio"
                  name="look-palette"
                  value={p.id}
                  checked={on}
                  onChange={() => setPalette(p.id)}
                  className="peer sr-only"
                />
                <span
                  className={`relative block aspect-square outline-solid outline-offset-2 peer-focus-visible:outline-[3px] peer-focus-visible:outline-ink ${
                    on
                      ? "outline-2 outline-ink"
                      : "outline-1 outline-rule group-hover:outline-rule-strong"
                  }`}
                  style={{ background: p.field }}
                >
                  <span
                    className="absolute right-0 bottom-0 size-[30%]"
                    style={{ background: p.accent }}
                  />
                  {on ? (
                    <Check
                      size={22}
                      strokeWidth={2.25}
                      aria-hidden
                      className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-white"
                    />
                  ) : null}
                </span>
                <span
                  className={`caps text-[14px] sm:text-[15px] ${on ? "text-ink" : "text-ink-2"}`}
                >
                  {p.label}
                </span>
              </label>
            );
          })}
        </fieldset>
        <fieldset>
          <legend className={legend}>Highlight</legend>
          <div className="grid grid-cols-6 gap-2 sm:gap-3">
            {ACCENTS.map((a) => {
              const on = a.id === accent;
              const colour = a.id === "theme" ? themeAccent : a.swatch;
              return (
                <label key={a.id} className="group grid cursor-pointer justify-items-center gap-1.5">
                  <input
                    type="radio"
                    name="look-accent"
                    value={a.id}
                    checked={on}
                    onChange={() => setAccent(a.id)}
                    className="peer sr-only"
                  />
                  <span
                    className={`relative grid aspect-square w-full place-items-center outline-solid outline-offset-2 peer-focus-visible:outline-[3px] peer-focus-visible:outline-ink ${
                      on ? "outline-2 outline-ink" : "outline-1 outline-rule group-hover:outline-rule-strong"
                    }`}
                    style={{ background: colour }}
                  >
                    {on ? <Check size={18} strokeWidth={2.5} aria-hidden className="text-white" /> : null}
                  </span>
                  <span className={`caps text-[12px] sm:text-[13px] ${on ? "text-ink" : "text-ink-2"}`}>{a.label}</span>
                </label>
              );
            })}
          </div>
        </fieldset>
        <Segments
          name="look-text"
          label="Text size"
          options={TEXT_SIZES.map((t, i) => ({ ...t, className: `normal-case tracking-normal ${["text-[15px]", "text-[18px]", "text-[21px]"][i]}` }))}
          value={text}
          onPick={setTextSize}
        />
        <Segments
          name="look-font"
          label="Font"
          options={FONTS.map((f) => ({
            ...f,
            className: "px-1 text-center leading-tight normal-case tracking-normal text-[15px] sm:text-[16px]",
            style: { fontFamily: FONT_FAMILIES[f.id] },
          }))}
          value={font}
          onPick={setFont}
        />
        <Segments
          name="look-motion"
          label="Motion"
          options={[
            { id: "full", label: "Lively" },
            { id: "calm", label: "Calm" },
          ]}
          value={motion}
          onPick={setMotion}
        />
        <Segments
          name="look-navcase"
          label="Sidebar text"
          options={NAV_CASES.map((c) => ({ ...c, className: "normal-case" }))}
          value={navCase}
          onPick={setNavCase}
        />
        <Segments
          name="look-sound"
          label="Sound"
          options={TOGGLES}
          value={sound}
          onPick={(v) => {
            setSound(v);
            // Switching it on plays a sample, so you know what you'll hear.
            if (v === "on") feedback("correct");
          }}
        />
        {sound === "on" ? <VolumeSlider value={volume} /> : null}
        {/* Touch devices that can vibrate only. Always rendered; <html data-vibrate>, set before paint,
            shows it, so the page never shifts after load. */}
        <div className="haptics-row">
          <Segments
            name="look-haptics"
            label="Haptics"
            options={TOGGLES}
            value={haptics}
            onPick={(v) => {
              setHaptics(v);
              if (v === "on") feedback("flip");
            }}
          />
        </div>
        <button
          type="button"
          onClick={resetAppearance}
          className="caps step inline-flex h-11 items-center gap-2 justify-self-start text-[15px] text-ink-2 underline decoration-rule-strong underline-offset-4 hover:text-ink"
        >
          <RotateCcw size={16} strokeWidth={1.75} aria-hidden />
          Reset to the Bayview look
        </button>
        <p className="text-[15px] text-ink-2">Saved on this device.</p>
      </div>
    </section>
  );
}

// Sound effect volume. Letting go plays the ding at the new level, so you hear what you picked.
function VolumeSlider({ value }: { value: number }) {
  return (
    <div className="grid gap-2">
      <label htmlFor="look-volume" className={`${legend} mb-0 flex justify-between`}>
        <span>Volume</span>
        <span className="num">{value}%</span>
      </label>
      <input
        id="look-volume"
        type="range"
        min={0}
        max={100}
        step={10}
        value={value}
        onChange={(e) => setVolume(Number(e.target.value))}
        onPointerUp={() => feedback("correct")}
        onKeyUp={(e) => {
          if (e.key.startsWith("Arrow") || e.key === "Home" || e.key === "End") feedback("correct");
        }}
        aria-valuetext={`${value} percent`}
        className="h-11 w-full cursor-pointer accent-[var(--ink)]"
      />
    </div>
  );
}

// A slice of the app in the current look, so every choice shows up as you make it.
function Preview() {
  return (
    <div aria-hidden className="grid border border-rule-strong">
      <div className="flex items-center justify-between gap-3 bg-field px-4 py-3 text-on-field">
        <span className="font-display text-[26px] leading-none font-bold uppercase">Leaderboard</span>
        <span className="caps num bg-you px-2 py-1 text-[13px] leading-none text-on-you">#3</span>
      </div>
      {[
        ["1", "Kaden", "1,284"],
        ["2", "Bernice", "1,190"],
        ["3", "You", "1,152"],
      ].map(([place, name, elo]) => {
        const you = name === "You";
        return (
          <div
            key={place}
            className={`grid grid-cols-[2rem_minmax(0,1fr)_auto] items-center gap-2 border-t border-rule px-4 py-2 ${you ? "bg-band" : ""}`}
          >
            <span className="num font-display text-[18px] font-semibold text-ink-2">{place}</span>
            <span className={`text-[16px] ${you ? "font-semibold" : ""}`}>
              {name}
              {you ? <span className="caps ml-2 bg-you px-1.5 py-0.5 text-[11px] text-on-you">You</span> : null}
            </span>
            <span className="num font-display text-[18px] font-semibold">{elo}</span>
          </div>
        );
      })}
    </div>
  );
}
