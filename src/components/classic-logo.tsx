// The official Bayview HOSA logo, drawn as a mask so it takes the current text colour.
// The season is live text so it can change each year; the art itself comes from
// scripts/make-brand-layers.py (public/brand/classic.png).
export const SEASON = "2026–2027";

export function ClassicLogo({ className = "" }: { className?: string }) {
  return (
    <span
      role="img"
      aria-label={`HOSA Bayview ${SEASON}`}
      className={`classic-logo ${className}`}
    >
      <span className="classic-art" aria-hidden />
      <span className="classic-season" aria-hidden>
        {SEASON}
      </span>
    </span>
  );
}
