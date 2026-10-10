import type { Metadata } from "next";
import Link from "next/link";
import { ChevronDown, ChevronRight } from "lucide-react";
import { EmptyState } from "@/components/empty-state";
import { PageTitle } from "@/components/page-title";
import { requireProfile } from "@/lib/auth";
import {
  type CompetitionState,
  orderCompetitions,
  progressLine,
  stateLabel,
  windowLine,
} from "@/lib/competitions";
import { createClient } from "@/lib/supabase/server";
import { createCompetition } from "./actions";
import { CompetitionForm } from "./forms";

export const metadata: Metadata = { title: "BLC" };

type CompetitionRow = {
  id: string;
  name: string;
  event: string;
  description: string;
  opens_at: string | null;
  closes_at: string | null;
  state: CompetitionState;
  test_count: number;
  my_done: number;
  created_at: string;
};

function StateMark({ state }: { state: CompetitionState }) {
  // Solid maroon is live, dashed is pending, grey is over. Same rule language as the rest of the app.
  const style = {
    open: "bg-you",
    upcoming: "border border-ink-2",
    closed: "bg-rule-strong",
  }[state];
  return (
    <span aria-hidden className={`inline-block size-2.5 shrink-0 ${style}`} />
  );
}

export default async function BlcPage() {
  const profile = await requireProfile();
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("competitions");
  if (error) throw new Error(`Competitions lookup failed: ${error.message}`);
  const rows = orderCompetitions((data ?? []) as CompetitionRow[]);
  const isExec = profile.role === "executive";

  return (
    <div className="grid grid-cols-1 gap-8">
      <PageTitle meta="Mock competitions">BLC</PageTitle>

      {isExec ? (
        <details className="group border-y border-rule">
          <summary className="caps step flex min-h-12 cursor-pointer list-none items-center justify-between gap-4 py-3 text-[18px] hover:bg-band [&::-webkit-details-marker]:hidden">
            New mock competition
            <ChevronDown
              size={22}
              strokeWidth={1.75}
              aria-hidden
              className="shrink-0 group-open:rotate-180 motion-safe:transition-transform motion-safe:duration-200 motion-safe:ease-out"
            />
          </summary>
          <div className="pt-2 pb-8">
            <CompetitionForm action={createCompetition} />
          </div>
        </details>
      ) : null}

      {rows.length ? (
        <ul className="border-t border-rule">
          {rows.map((c) => {
            const progress = progressLine(c.state, c.my_done, c.test_count);
            return (
              <li key={c.id} className="border-b border-rule">
                <Link
                  href={`/blc/${c.id}`}
                  className="step grid grid-cols-[minmax(0,1fr)_auto] items-center gap-4 px-1 py-4 hover:bg-band sm:px-3"
                >
                  <span className="grid min-w-0 gap-1.5">
                    <span className="caps flex min-w-0 flex-wrap items-center gap-x-2.5 gap-y-1 text-[15px]">
                      <StateMark state={c.state} />
                      <span
                        className={
                          c.state === "open" ? "text-you" : "text-ink-2"
                        }
                      >
                        {stateLabel(c.state)}
                      </span>
                      {c.event ? (
                        <span className="text-ink-2">{c.event}</span>
                      ) : null}
                    </span>
                    <span className="block font-display text-[clamp(1.75rem,6vw,2.5rem)] leading-[1.02] font-semibold uppercase [overflow-wrap:anywhere]">
                      {c.name}
                    </span>
                    <span className="block text-[16px] text-ink-2">
                      {windowLine(c.opens_at, c.closes_at)}
                    </span>
                    {progress ? (
                      <span className="num caps block text-[15px] text-ink-2">
                        {progress}
                      </span>
                    ) : null}
                  </span>
                  <ChevronRight
                    size={22}
                    strokeWidth={1.75}
                    aria-hidden
                    className="text-ink-2"
                  />
                </Link>
              </li>
            );
          })}
        </ul>
      ) : (
        <EmptyState title="No mock competitions yet">
          {isExec
            ? "Post one above and members will see it here."
            : "Execs post them here when a run is ready. Check back."}
        </EmptyState>
      )}
    </div>
  );
}
