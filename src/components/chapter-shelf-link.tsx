import Link from "next/link";
import { ArrowRight, LibraryBig } from "lucide-react";

// The chapter's own shelf (/library: files and links for every event). It lives under Events now, so the event
// pages carry the door to it.
export function ChapterShelfLink() {
  return (
    <Link
      href="/library"
      className="step group grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-4 border-[3px] border-ink p-4 hover:bg-band sm:p-5"
    >
      <LibraryBig size={28} strokeWidth={1.75} aria-hidden />
      <span className="grid gap-1">
        <span className="font-display text-[clamp(1.5rem,5vw,2rem)] leading-none font-bold uppercase">
          Chapter resources
        </span>
        <span className="text-16 text-ink-2">
          Files and links for every event, from the executives
        </span>
      </span>
      <ArrowRight
        size={22}
        strokeWidth={2}
        aria-hidden
        className="motion-safe:transition-transform group-hover:translate-x-0.5"
      />
    </Link>
  );
}
