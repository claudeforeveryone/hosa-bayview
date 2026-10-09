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

// In the root layout. On Auto, follows the device when it switches between light and dark.
export function AppearanceSync() {
  useEffect(() => {
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => {
      if (readMode() === "system") applyMode("system");
    };
    media.addEventListener("change", onChange);
    return () => media.removeEventListener("change", onChange);
  }, []);
  return null;
}

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
        <div
          role="radiogroup"
          aria-label="Mode"
          className="grid grid-cols-3 border border-rule-strong"
        >
          {MODES.map((m) => {
            const on = m.id === mode;
            return (
              <button
                key={m.id}
                type="button"
                role="radio"
                aria-checked={on}
                onClick={() => setMode(m.id)}
                className={`caps step h-12 border-r border-rule-strong text-[16px] last:border-r-0 ${
                  on ? "bg-ink text-ground" : "text-ink hover:bg-band"
                }`}
              >
                {m.label}
              </button>
            );
          })}
        </div>
        <div
          role="radiogroup"
          aria-label="Colour"
          className="grid grid-cols-4 gap-2 sm:gap-3"
        >
          {PALETTES.map((p) => {
            const on = p.id === palette;
            return (
              <button
                key={p.id}
                type="button"
                role="radio"
                aria-checked={on}
                onClick={() => setPalette(p.id)}
                className="group grid gap-2 text-left"
              >
                <span
                  className={`relative block aspect-square outline-offset-2 ${
                    on
                      ? "outline-2 outline-ink"
                      : "outline-1 outline-rule group-hover:outline-rule-strong"
                  } outline-solid`}
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
              </button>
            );
          })}
        </div>
      </div>
    </section>
  );
}
