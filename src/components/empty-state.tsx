import type { ReactNode } from "react";

// Three fused rings and a bond, the skeleton of a molecule, in thin rule-coloured lines. It sits in the corner
// of an empty state, clipped by the frame, so a blank page still reads as the science club's. Decorative only.
const RINGS = [
  [24, 40],
  [58.64, 40],
  [41.32, 70],
] as const;
const hexagon = ([cx, cy]: readonly [number, number]) =>
  [0, 1, 2, 3, 4, 5]
    .map((k) => {
      const a = (Math.PI / 3) * k - Math.PI / 2;
      return `${(cx + 20 * Math.cos(a)).toFixed(2)},${(cy + 20 * Math.sin(a)).toFixed(2)}`;
    })
    .join(" ");

function Molecule() {
  return (
    <svg
      aria-hidden
      viewBox="0 0 84 96"
      className="pointer-events-none absolute -right-5 -bottom-8 h-24 w-auto text-rule sm:-right-3 sm:-bottom-5 sm:h-36"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinejoin="miter"
    >
      {RINGS.map((c) => (
        <polygon key={c.join()} points={hexagon(c)} />
      ))}
      {/* A double bond inside the first ring, and a bond leaving the second. */}
      <path d="M12.5 33.5 L12.5 46.5 M58.64 20 L58.64 6" />
    </svg>
  );
}

// Nothing here yet: a band with an ink frame, the title in display caps, and one line of what to do next, with
// the way forward (a link or button) below it. Solid rules only.
// The molecule is one quiet moment per screen: an empty state in a later section of a page that has an earlier
// one (Resources' breakdown under its files) passes mark={false}, so two in a row don't repeat it.
export function EmptyState({
  title,
  children,
  action,
  mark = true,
}: {
  title: string;
  children?: ReactNode;
  action?: ReactNode;
  mark?: boolean;
}) {
  return (
    <div className="relative grid justify-items-start gap-3 overflow-hidden border-[3px] border-ink bg-band px-4 py-8 sm:px-6">
      {mark ? <Molecule /> : null}
      <p className="relative font-display text-[clamp(1.75rem,6vw,2.5rem)] leading-[1.05] font-semibold uppercase">
        {title}
      </p>
      {children ? (
        <p className="relative max-w-[60ch] text-17 text-ink-2">
          {children}
        </p>
      ) : null}
      {action ? <div className="relative">{action}</div> : null}
    </div>
  );
}
