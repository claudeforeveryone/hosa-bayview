"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import {
  LUCKY_EVENT,
  LUCKY_LABEL,
  type LuckyReason,
  isJackpot,
  luckyDuration,
  parseLuckyEvent,
  particleCount,
} from "@/lib/lucky";
import { rollLuckyBonus } from "@/lib/lucky-client";

type Bonus = { id: number; amount: number; reason: LuckyReason };

// Mounted once in the app layout. Rolls the daily visit bonus, then shows every bonus that pays,
// one at a time, as a full-width band across the top. Tap to clear; it clears itself otherwise.
export function LuckyBonus() {
  const [queue, setQueue] = useState<Bonus[]>([]);
  const nextId = useRef(0);

  useEffect(() => {
    // First app load of the day. Later loads get nothing from the server.
    void rollLuckyBonus("visit");
    const onBonus = (event: Event) => {
      const parsed = parseLuckyEvent((event as CustomEvent).detail);
      if (!parsed) return;
      nextId.current += 1;
      const id = nextId.current;
      setQueue((q) => [...q, { id, ...parsed }]);
    };
    window.addEventListener(LUCKY_EVENT, onBonus);
    return () => window.removeEventListener(LUCKY_EVENT, onBonus);
  }, []);

  const current = queue[0];
  const dismiss = useCallback(() => setQueue((q) => q.slice(1)), []);

  useEffect(() => {
    if (!current) return;
    const timer = window.setTimeout(dismiss, luckyDuration(current.amount));
    return () => window.clearTimeout(timer);
  }, [current, dismiss]);

  // The live region is always here, so the text is announced when it changes.
  return (
    <div
      role="status"
      aria-live="polite"
      className="pointer-events-none fixed inset-x-0 top-0 z-50 pt-[env(safe-area-inset-top)]"
    >
      {current ? (
        <Band key={current.id} bonus={current} onDismiss={dismiss} />
      ) : null}
    </div>
  );
}

// Each piece flies out at its own angle. Angles are fixed by index, so the render is the same every time.
function burstStyle(index: number, count: number, far: boolean): CSSProperties {
  const angle = (index / count) * Math.PI * 2;
  const distance = (far ? 170 : 120) + (index % 3) * 18;
  return {
    "--x": `${Math.round(Math.cos(angle) * distance)}px`,
    "--y": `${Math.round(Math.sin(angle) * distance)}px`,
  } as CSSProperties;
}

function Band({ bonus, onDismiss }: { bonus: Bonus; onDismiss: () => void }) {
  const jackpot = isJackpot(bonus.amount);
  const count = particleCount(bonus.amount);
  return (
    <button
      type="button"
      onClick={onDismiss}
      className={`lucky-band pointer-events-auto relative isolate flex w-full flex-col items-center justify-center overflow-hidden bg-ink text-ground ${
        jackpot ? "px-4 py-7 sm:py-9" : "px-4 py-4 sm:py-5"
      }`}
    >
      <span
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 -z-10"
      >
        {Array.from({ length: count }, (_, i) => (
          <span
            key={i}
            className={`lucky-piece absolute top-1/2 left-1/2 bg-ground ${jackpot ? "size-3" : "size-2"}`}
            style={burstStyle(i, count, jackpot)}
          />
        ))}
      </span>
      <span className="caps text-[15px] leading-none text-ground/85 sm:text-[16px]">
        {jackpot ? "Jackpot" : `Lucky bonus · ${LUCKY_LABEL[bonus.reason]}`}
      </span>
      <span
        className={`lucky-num num mt-1 font-display leading-none font-bold ${
          jackpot
            ? "text-[clamp(3.5rem,16vw,6rem)]"
            : "text-[clamp(2.25rem,9vw,3.5rem)]"
        }`}
      >
        +{bonus.amount} Elo
      </span>
      <span className="caps mt-2 text-[13px] text-ground/70">Tap to close</span>
    </button>
  );
}
