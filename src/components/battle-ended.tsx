import Link from "next/link";
import type { RefObject } from "react";

// A battle you can't play any more: it ended (left idle 30 minutes, or the host moved on), or it's closed to you.

export function BattleEnded({
  title,
  href,
  label,
  heading,
}: {
  title: string;
  href: string;
  label: string;
  heading?: RefObject<HTMLHeadingElement | null>;
}) {
  return (
    <div className="reveal grid justify-items-start gap-4 border-y border-rule-strong px-1 py-8 sm:px-3">
      <h1
        ref={heading}
        tabIndex={-1}
        className="font-display text-[clamp(1.75rem,6vw,2.5rem)] leading-[1.05] font-semibold uppercase outline-none"
      >
        {title}
      </h1>
      <Link
        href={href}
        className="caps step inline-flex h-12 items-center border border-ink px-5 text-[17px] hover:bg-band"
      >
        {label}
      </Link>
    </div>
  );
}
