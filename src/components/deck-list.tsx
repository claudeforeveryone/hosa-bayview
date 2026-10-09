import Link from "next/link";
import { ChevronRight } from "lucide-react";
import type { DeckSummary } from "@/lib/decks";
import { formNumber } from "@/lib/join-code";

// Rows for decks: title, card count and where the deck lives. Plain rules, no cards or badges.
// "Only you" is only said to the owner; an executive looking at someone else's private deck sees "Private".
export function DeckList({ decks, viewerId }: { decks: DeckSummary[]; viewerId: string }) {
  return (
    <ul className="border-t border-rule">
      {decks.map((d) => {
        const count = `${d.card_count} card${d.card_count === 1 ? "" : "s"}`;
        const privacy = d.owner_id === viewerId ? "Only you" : "Private";
        const where = d.classroom_name ? (d.is_shared ? d.classroom_name : `${privacy} · ${d.classroom_name}`) : privacy;
        return (
          <li key={d.id} className="border-b border-rule">
            <Link
              href={`/flashcards/${d.id}`}
              className="step grid grid-cols-[minmax(0,1fr)_auto] items-center gap-4 px-1 py-4 hover:bg-band sm:px-3"
            >
              <span className="min-w-0">
                <span className="block truncate font-display text-[clamp(1.5rem,5vw,2.25rem)] leading-[1.05] font-semibold uppercase">
                  {d.title}
                </span>
                <span className="block truncate text-[16px] text-ink-2">
                  {count} · {where}
                </span>
              </span>
              <span className="flex items-center gap-3 text-ink-2">
                <span className="num caps hidden text-[15px] sm:inline">{formNumber("D", d.num)}</span>
                <ChevronRight size={22} strokeWidth={1.75} aria-hidden />
              </span>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
