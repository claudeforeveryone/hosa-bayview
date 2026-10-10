import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { EmptyState } from "@/components/empty-state";
import { groupBySection } from "@/lib/materials";

// The event page's middle: what to read (resources by section) and what to practise (tests, decks, skills).

export const hubHeading =
  "px-1 font-display text-[clamp(2rem,7vw,3rem)] leading-none font-bold uppercase sm:px-3";

// One row per section with its count; every row opens the Resources tab, where sections fold open.
export function HubResources({
  base,
  rows,
  canManage,
}: {
  base: string;
  rows: { section: string | null }[];
  canManage: boolean;
}) {
  const href = `${base}/resources`;
  const groups = groupBySection(rows);
  return (
    <section aria-labelledby="hub-resources-h" className="grid gap-4">
      <h2 id="hub-resources-h" className={hubHeading}>
        Resources
      </h2>
      {groups.length ? (
        <ul className="border-t border-rule">
          {groups.map((g) => (
            <li key={g.section ?? "general"} className="border-b border-rule">
              <Link
                href={href}
                className="step grid min-h-12 grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-3 px-1 py-3 hover:bg-band sm:px-3"
              >
                <span className="caps text-[17px] font-semibold [overflow-wrap:anywhere]">
                  {g.section ?? "General"}
                </span>
                <span className="num text-[15px] text-ink-2">
                  {g.items.length}
                </span>
                <ChevronRight
                  size={20}
                  strokeWidth={1.75}
                  aria-hidden
                  className="text-ink-2"
                />
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <EmptyState
          title="No resources yet"
          action={
            canManage ? (
              <Link
                href={href}
                className="caps step inline-flex h-11 items-center gap-2 border border-ink px-4 text-[16px] hover:bg-band"
              >
                Add a file or link
                <ChevronRight size={18} strokeWidth={2} aria-hidden />
              </Link>
            ) : null
          }
        />
      )}
    </section>
  );
}

export type PracticeCell = {
  slug: string;
  label: string;
  count: number;
  extra?: string | null; // for managers: "3 drafts"
};

// Counts at poster scale, one cell per kind of practice, each a door to its tab. Hairlines between, no boxes.
export function PracticeStrip({
  base,
  cells,
}: {
  base: string;
  cells: PracticeCell[];
}) {
  return (
    <section aria-labelledby="hub-practice-h" className="grid gap-4">
      <h2 id="hub-practice-h" className={hubHeading}>
        Practice
      </h2>
      <ul
        className={`grid border-y border-rule ${cells.length === 3 ? "grid-cols-3" : "grid-cols-2"}`}
      >
        {cells.map((c) => (
          <li key={c.slug} className="border-r border-rule last:border-r-0">
            <Link
              href={`${base}/${c.slug}`}
              className="step grid h-full content-between gap-3 px-3 py-4 hover:bg-band sm:px-5 sm:py-5"
            >
              <span className="num font-display text-[clamp(2.75rem,11vw,4.5rem)] leading-[0.9] font-bold">
                {c.count}
              </span>
              <span className="grid gap-0.5">
                <span className="caps flex items-center gap-1 text-[16px] sm:text-[18px]">
                  {c.label}
                  <ChevronRight
                    size={18}
                    strokeWidth={2}
                    aria-hidden
                    className="text-ink-2"
                  />
                </span>
                {c.extra ? (
                  <span className="text-[14px] text-ink-2">{c.extra}</span>
                ) : null}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
