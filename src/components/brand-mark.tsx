import type { CSSProperties } from "react";

// The chapter mark: the tiger plus "Shatter every limit" and the season. Takes the current text colour.
// The intro (styles in globals.css, .brand-*) plays once per browser session; the root layout's
// intro script marks later loads with data-intro="done" so they render still.
export function BrandMark({
  layout = "stack",
  width,
  className = "",
}: {
  layout?: "stack" | "row";
  // Tiger width; the words scale from it.
  width: string;
  className?: string;
}) {
  return (
    <span
      role="img"
      aria-label="HOSA Bayview. Shatter every limit. 2026 to 2027"
      className={`brand brand-${layout} ${className}`}
      style={{ "--bw": width } as CSSProperties}
    >
      <span className="brand-tiger" aria-hidden>
        <span className="brand-glint" />
      </span>
      <span className="brand-words" aria-hidden>
        <span className="brand-l1">
          Shatter
          <span className="brand-shards">
            <i />
            <i />
            <i />
          </span>
        </span>
        <span className="brand-l2">Every limit</span>
        <span className="brand-year">2026–2027</span>
        <span className="brand-scan" />
      </span>
    </span>
  );
}
