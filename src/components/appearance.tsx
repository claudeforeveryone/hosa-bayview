"use client";

import { Check } from "lucide-react";
import { useEffect, useSyncExternalStore } from "react";
import {
  MODES,
  PALETTES,
  applyMode,
  readMode,
  readPalette,
  setMode,
  setPalette,
  type Mode,
  type Palette,
} from "@/lib/appearance";

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
      if (e.key === null || e.key === "theme" || e.key === "palette") {
        applyMode(readMode());
        applyPalette(readPalette());
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

// Native radios, so Tab lands on the group once and the arrow keys move the choice.
export function LookSection() {
  const mode = useSyncExternalStore<Mode>(subscribe, readMode, () => "system");
  const palette = useSyncExternalStore<Palette>(
    subscribe,
    readPalette,
    () => "bayview",
  );

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
        <fieldset className="grid grid-cols-3 border border-rule-strong">
          <legend className="sr-only">Mode</legend>
          {MODES.map((m) => (
            <label
              key={m.id}
              className="relative border-r border-rule-strong last:border-r-0"
            >
              <input
                type="radio"
                name="look-mode"
                value={m.id}
                checked={m.id === mode}
                onChange={() => setMode(m.id)}
                className="peer sr-only"
              />
              <span className="caps step flex h-12 cursor-pointer items-center justify-center text-[16px] text-ink peer-checked:bg-ink peer-checked:text-ground peer-focus-visible:outline-2 peer-focus-visible:-outline-offset-4 peer-focus-visible:outline-ground hover:bg-band peer-checked:hover:bg-ink">
                {m.label}
              </span>
            </label>
          ))}
        </fieldset>
        <fieldset className="grid grid-cols-4 gap-2 sm:gap-3">
          <legend className="sr-only">Colour</legend>
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
      </div>
    </section>
  );
}
