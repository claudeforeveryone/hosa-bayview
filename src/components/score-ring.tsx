// The percent on a finished attempt, inside a ring that fills to it once when the result first shows. Square
// ends and flat strokes to match the rest of the app; the number is real text, the ring is decoration.
export function ScoreRing({ pct }: { pct: number }) {
  const value = Math.max(0, Math.min(100, Math.round(pct)));
  return (
    <div className="relative grid size-24 shrink-0 place-items-center sm:size-28">
      <svg
        aria-hidden
        viewBox="0 0 100 100"
        className="absolute inset-0 size-full -rotate-90"
        fill="none"
        strokeWidth={9}
      >
        <circle cx="50" cy="50" r="42" className="stroke-rule" />
        {value > 0 ? (
          <circle
            cx="50"
            cy="50"
            r="42"
            pathLength={100}
            className="score-ring stroke-you-line"
            style={{ strokeDasharray: `${value} 100` }}
          />
        ) : null}
      </svg>
      <span className="num relative font-display text-[26px] leading-none font-bold sm:text-[30px]">
        {value}%
      </span>
    </div>
  );
}
