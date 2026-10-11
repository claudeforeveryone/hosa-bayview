"use client";

import { Check, Pipette, RotateCcw } from "lucide-react";
import {
  useEffect,
  useState,
  useSyncExternalStore,
  type CSSProperties,
  type ReactNode,
} from "react";
import {
  ACCENTS,
  DEFAULT_ACCENT_HEX,
  DEFAULT_FIELD_HEX,
  DEFAULT_VOLUME,
  FONTS,
  LOOK_KEYS,
  MODES,
  NAV_CASES,
  PALETTES,
  TEXT_SIZES,
  applyExtras,
  applyMode,
  applyPalette,
  parseHex,
  readAccent,
  readAccentHex,
  readFieldHex,
  readFont,
  readHaptics,
  readMode,
  readNavCase,
  readNotifySound,
  readPalette,
  readSound,
  readTextSize,
  readVolume,
  readableOn,
  resetAppearance,
  setAccent,
  setAccentHex,
  setFieldHex,
  setFont,
  setHaptics,
  setMode,
  setNavCase,
  setNotifySound,
  setPalette,
  setSound,
  setTextSize,
  setVolume,
  type Accent,
  type Font,
  type Mode,
  type NavCase,
  type TextSize,
  type ThemeChoice,
  type Toggle,
} from "@/lib/appearance";
import { feedback } from "@/lib/feedback";
import { SettingsSection } from "@/components/settings-section";

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

// In the root layout. On Device, follows the device when it switches between light and dark, and picks up a
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
  dyslexic: "var(--font-lexend), system-ui, sans-serif",
};

// A setting's name, in the condensed caps the app uses for labels.
const legend = "caps text-[16px] text-ink";

// One setting: its name, one plain line about what it does, then the control. Its controls are native radios
// or inputs, so Tab lands on the group once.
function Choice({
  name,
  label,
  hint,
  children,
}: {
  name: string;
  label: string;
  hint?: ReactNode;
  children: ReactNode;
}) {
  const hintId = hint ? `${name}-hint` : undefined;
  return (
    <fieldset aria-describedby={hintId} className="grid min-w-0 gap-3">
      <legend className={legend}>{label}</legend>
      {hint ? (
        <p id={hintId} className="text-[15px] text-ink-2">
          {hint}
        </p>
      ) : null}
      {children}
    </fieldset>
  );
}

// A row of square segments backed by native radios. Also the on/off for notifications in Settings > Phone app.
// busy: dimmed and ignoring picks while a change is in flight; the radios stay focusable, so focus isn't lost.
export function Segments<T extends string>({
  name,
  label,
  options,
  value,
  onPick,
  hint,
  busy = false,
}: {
  name: string;
  label: string;
  options: {
    id: T;
    label: string;
    className?: string;
    style?: CSSProperties;
  }[];
  value: T;
  onPick: (v: T) => void;
  hint?: ReactNode;
  busy?: boolean;
}) {
  return (
    <Choice name={name} label={label} hint={hint}>
      <div className="grid auto-cols-fr grid-flow-col border-2 border-ink">
        {options.map((o) => (
          <label
            key={o.id}
            className="relative border-r border-rule-strong last:border-r-0"
          >
            <input
              type="radio"
              name={name}
              value={o.id}
              checked={o.id === value}
              onChange={() => {
                if (!busy) onPick(o.id);
              }}
              aria-disabled={busy || undefined}
              className="peer sr-only"
            />
            <span
              className={`caps step flex h-12 cursor-pointer items-center justify-center text-[16px] text-ink peer-checked:bg-ink peer-checked:text-ground peer-focus-visible:outline-2 peer-focus-visible:-outline-offset-4 peer-focus-visible:outline-ground hover:bg-band peer-checked:hover:bg-ink peer-aria-disabled:cursor-wait peer-aria-disabled:opacity-60 ${o.className ?? ""}`}
              style={o.style}
            >
              {o.label}
            </span>
          </label>
        ))}
      </div>
    </Choice>
  );
}

// One square swatch backed by a native radio, with its name underneath.
function Swatch({
  name,
  value,
  label,
  on,
  onPick,
  background,
  corner,
  icon,
}: {
  name: string;
  value: string;
  label: string;
  on: boolean;
  onPick: () => void;
  background: string;
  corner?: string;
  icon?: ReactNode;
}) {
  const mark = readableOn(parseHex(background) ?? "#000000");
  return (
    <label className="group grid cursor-pointer justify-items-stretch gap-1.5">
      <input
        type="radio"
        name={name}
        value={value}
        checked={on}
        onChange={onPick}
        className="peer sr-only"
      />
      <span
        className={`relative grid aspect-square w-full place-items-center outline-solid outline-offset-2 peer-focus-visible:outline-[3px] peer-focus-visible:outline-ink ${
          on
            ? "outline-[3px] outline-ink"
            : "outline-1 outline-rule-strong group-hover:outline-ink"
        }`}
        style={{ background }}
      >
        {corner ? (
          <span
            className="absolute right-0 bottom-0 size-[30%]"
            style={{ background: corner }}
          />
        ) : null}
        {on ? (
          <Check
            size={20}
            strokeWidth={2.5}
            aria-hidden
            style={{ color: mark }}
          />
        ) : icon ? (
          <span style={{ color: mark }}>{icon}</span>
        ) : null}
      </span>
      <span
        className={`caps text-center text-[14px] ${on ? "text-ink" : "text-ink-2"}`}
      >
        {label}
      </span>
    </label>
  );
}

// A colour picker plus a hex field. The field only saves once it holds a whole #rgb or #rrggbb, and goes back
// to the saved colour when you leave it half typed.
function HexPicker({
  id,
  label,
  value,
  onPick,
}: {
  id: string;
  label: string;
  value: string;
  onPick: (hex: string) => void;
}) {
  const [draft, setDraft] = useState<string | null>(null);
  const shown = draft ?? value;
  const bad = draft !== null && parseHex(draft) === null;
  return (
    <div className="grid gap-2 border-2 border-ink bg-band p-3">
      <label htmlFor={`${id}-hex`} className="caps text-[14px] text-ink-2">
        {label}
      </label>
      <div className="flex items-stretch gap-2">
        <input
          type="color"
          aria-label={`${label}: pick a colour`}
          value={value}
          onChange={(e) => {
            setDraft(null);
            onPick(e.target.value);
          }}
          className="h-12 w-16 shrink-0 cursor-pointer border-2 border-ink bg-ground p-1"
        />
        <input
          id={`${id}-hex`}
          type="text"
          value={shown.toUpperCase()}
          onChange={(e) => {
            const v = e.target.value;
            setDraft(v);
            const hex = parseHex(v);
            if (hex) onPick(hex);
          }}
          onBlur={() => setDraft(null)}
          maxLength={7}
          autoComplete="off"
          autoCapitalize="characters"
          autoCorrect="off"
          spellCheck={false}
          aria-invalid={bad ? true : undefined}
          aria-describedby={bad ? `${id}-err` : undefined}
          className="num h-12 w-0 min-w-0 flex-1 border-2 border-ink bg-ground px-3 font-display text-[22px] font-semibold tracking-[0.06em] text-ink outline-none focus:border-you aria-invalid:border-danger sm:max-w-44"
        />
      </div>
      {bad ? (
        <p id={`${id}-err`} role="alert" className="text-[15px] text-danger">
          Use a hex colour like #1E3D62 or #FC0.
        </p>
      ) : null}
    </div>
  );
}

// Look settings, saved per device. Live: the preview and the whole app change as each choice is made.
export function AppearanceSection() {
  const mode = useSyncExternalStore<Mode>(subscribe, readMode, () => "system");
  const palette = useSyncExternalStore<ThemeChoice>(
    subscribe,
    readPalette,
    () => "bayview",
  );
  const fieldHex = useSyncExternalStore<string>(
    subscribe,
    readFieldHex,
    () => DEFAULT_FIELD_HEX,
  );
  const accent = useSyncExternalStore<Accent>(
    subscribe,
    readAccent,
    () => "theme",
  );
  const accentHex = useSyncExternalStore<string>(
    subscribe,
    readAccentHex,
    () => DEFAULT_ACCENT_HEX,
  );
  const text = useSyncExternalStore<TextSize>(
    subscribe,
    readTextSize,
    () => "standard",
  );
  const font = useSyncExternalStore<Font>(subscribe, readFont, () => "default");
  const navCase = useSyncExternalStore<NavCase>(
    subscribe,
    readNavCase,
    () => "upper",
  );
  const themeAccent =
    PALETTES.find((p) => p.id === palette)?.accent ?? DEFAULT_ACCENT_HEX;

  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-10 min-[1400px]:grid-cols-[minmax(0,1fr)_18rem] min-[1400px]:items-start min-[1400px]:gap-12">
      {/* First in the source so it sits on top on a phone; on desktop it stays in view beside the settings. */}
      <div className="min-w-0 min-[1400px]:sticky min-[1400px]:top-6 min-[1400px]:col-start-2 min-[1400px]:row-start-1">
        <Preview />
      </div>
      <div className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-12 min-[1400px]:col-start-1 min-[1400px]:row-start-1">
        <SettingsSection
          id="colour-h"
          title="Colour"
          description="Light or dark, and the colours used around the app."
        >
          <Segments
            name="look-mode"
            label="Mode"
            options={MODES}
            value={mode}
            onPick={setMode}
            hint="Device follows your phone or computer's light or dark setting."
          />
          <Choice
            name="look-palette"
            label="Theme"
            hint="Colour of the sidebar, headers and panels."
          >
            <div className="grid grid-cols-3 gap-3 sm:grid-cols-5">
              {PALETTES.map((p) => (
                <Swatch
                  key={p.id}
                  name="look-palette"
                  value={p.id}
                  label={p.label}
                  on={p.id === palette}
                  onPick={() => setPalette(p.id)}
                  background={p.field}
                  corner={p.accent}
                />
              ))}
              <Swatch
                name="look-palette"
                value="custom"
                label="Custom"
                on={palette === "custom"}
                onPick={() => setFieldHex(fieldHex)}
                background={fieldHex}
                icon={<Pipette size={20} strokeWidth={2} aria-hidden />}
              />
            </div>
            {palette === "custom" ? (
              <HexPicker
                id="look-field"
                label="Theme colour"
                value={fieldHex}
                onPick={setFieldHex}
              />
            ) : null}
          </Choice>
          <Choice
            name="look-accent"
            label="Highlight"
            hint="Marks you on leaderboards and the current tab."
          >
            <div className="grid grid-cols-4 gap-3 sm:grid-cols-7">
              {ACCENTS.map((a) => (
                <Swatch
                  key={a.id}
                  name="look-accent"
                  value={a.id}
                  label={a.label}
                  on={a.id === accent}
                  onPick={() => setAccent(a.id)}
                  background={a.id === "theme" ? themeAccent : a.swatch}
                />
              ))}
              <Swatch
                name="look-accent"
                value="custom"
                label="Custom"
                on={accent === "custom"}
                onPick={() => setAccentHex(accentHex)}
                background={accentHex}
                icon={<Pipette size={18} strokeWidth={2} aria-hidden />}
              />
            </div>
            {accent === "custom" ? (
              <HexPicker
                id="look-accent"
                label="Highlight colour"
                value={accentHex}
                onPick={setAccentHex}
              />
            ) : null}
          </Choice>
        </SettingsSection>

        <SettingsSection
          id="text-h"
          title="Text"
          description="How big the words are and which typeface they use."
        >
          <Segments
            name="look-text"
            label="Text size"
            options={TEXT_SIZES.map((t, i) => ({
              ...t,
              className: `normal-case tracking-normal ${["text-[15px]", "text-[18px]", "text-[21px]"][i]}`,
            }))}
            value={text}
            onPick={setTextSize}
            hint="Makes the words bigger. Pictures stay their usual size."
          />
          <Segments
            name="look-font"
            label="Font"
            options={FONTS.map((f) => ({
              ...f,
              className:
                "px-1 text-center leading-tight normal-case tracking-normal text-[15px] sm:text-[16px]",
              style: { fontFamily: FONT_FAMILIES[f.id] },
            }))}
            value={font}
            onPick={setFont}
            hint="Dyslexia-friendly switches the whole app to Lexend, a typeface built for easier reading."
          />
          <Segments
            name="look-navcase"
            label="Sidebar text"
            options={NAV_CASES.map((c) => ({ ...c, className: "normal-case" }))}
            value={navCase}
            onPick={setNavCase}
            hint="Shows the menu labels in capitals or as written."
          />
        </SettingsSection>

        <SettingsSection
          id="reset-h"
          title="Reset"
          description="Looks and sound are saved on this device only. Reset puts them back to the defaults. Your account is not changed."
        >
          <button
            type="button"
            onClick={resetAppearance}
            className="caps step press inline-flex h-12 items-center gap-2 justify-self-start border-2 border-ink px-5 text-[16px] text-ink hover:bg-band"
          >
            <RotateCcw size={18} strokeWidth={1.75} aria-hidden />
            Reset look and sound
          </button>
        </SettingsSection>
      </div>
    </div>
  );
}

// Sound effects, the bell's chime, and vibration. Saved on this device like the look.
export function SoundSection() {
  const sound = useSyncExternalStore<Toggle>(subscribe, readSound, () => "on");
  const volume = useSyncExternalStore<number>(
    subscribe,
    readVolume,
    () => DEFAULT_VOLUME,
  );
  const haptics = useSyncExternalStore<Toggle>(
    subscribe,
    readHaptics,
    () => "on",
  );
  const notify = useSyncExternalStore<Toggle>(
    subscribe,
    readNotifySound,
    () => "on",
  );

  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-12">
      <SettingsSection
        id="sounds-h"
        title="Sounds"
        description="Sound effects and the notification chime."
      >
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
          hint="Dings and pops when you answer, flip cards and finish."
        />
        {sound === "on" ? <VolumeSlider value={volume} /> : null}
        <Segments
          name="look-notifysound"
          label="Notification sound"
          options={TOGGLES}
          value={notify}
          onPick={(v) => {
            setNotifySound(v);
            if (v === "on") feedback("notify");
          }}
          hint="A chime when something new lands in your notifications."
        />
      </SettingsSection>

      {/* Touch devices that can vibrate only. Always rendered; <html data-vibrate>, set before paint,
          shows it, so the page never shifts after load. */}
      <div className="haptics-row">
        <SettingsSection
          id="haptics-h"
          title="Vibration"
          description="Short buzzes on touch screens that can vibrate. Other devices don't show this."
        >
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
        </SettingsSection>
      </div>

      <p className="text-[15px] text-ink-2">Saved on this device.</p>
    </div>
  );
}

// Sound effect volume. Letting go plays the ding at the new level, so you hear what you picked.
function VolumeSlider({ value }: { value: number }) {
  return (
    <div className="grid gap-3">
      <label htmlFor="look-volume" className={`${legend} flex justify-between`}>
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
          if (e.key.startsWith("Arrow") || e.key === "Home" || e.key === "End")
            feedback("correct");
        }}
        aria-valuetext={`${value} percent`}
        className="h-12 w-full cursor-pointer accent-[var(--ink)]"
      />
    </div>
  );
}

// A slice of the app in the current look, so every choice shows up as you make it. Sample names and numbers
// only: nothing here is real chapter data.
function Preview() {
  return (
    <div className="grid gap-3">
      <div className="flex items-baseline justify-between gap-3">
        <p className="caps text-[16px] text-ink">Preview</p>
        <p className="text-[14px] text-ink-2">Sample data</p>
      </div>
      <div aria-hidden className="grid border-2 border-ink">
        <div className="flex items-center justify-between gap-3 bg-field px-4 py-3 text-on-field">
          <span className="font-display text-[26px] leading-none font-bold uppercase">
            Leaderboard
          </span>
          <span className="caps num bg-you px-2 py-1 text-[13px] leading-none text-on-you">
            #3
          </span>
        </div>
        {[
          ["1", "Member A", "1,284"],
          ["2", "Member B", "1,190"],
          ["3", "You", "1,152"],
        ].map(([place, name, score]) => {
          const you = name === "You";
          return (
            <div
              key={place}
              className={`grid grid-cols-[2rem_minmax(0,1fr)_auto] items-center gap-2 border-t border-rule px-4 py-3 ${you ? "bg-band" : ""}`}
            >
              <span className="num font-display text-[18px] font-semibold text-ink-2">
                {place}
              </span>
              <span className={`text-[16px] ${you ? "font-semibold" : ""}`}>
                {name}
                {you ? (
                  <span className="caps ml-2 bg-you px-1.5 py-0.5 text-[11px] text-on-you">
                    You
                  </span>
                ) : null}
              </span>
              <span className="num font-display text-[18px] font-semibold">
                {score}
              </span>
            </div>
          );
        })}
        <div className="flex items-center justify-between gap-3 border-t border-rule-strong px-4 py-3">
          <span className="text-[15px] text-ink-2">Buttons and highlights</span>
          <span className="caps inline-flex h-10 items-center bg-ink px-4 text-[15px] text-ground">
            Start
          </span>
        </div>
      </div>
    </div>
  );
}
