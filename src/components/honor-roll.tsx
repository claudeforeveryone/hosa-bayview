import Link from "next/link";
import { awardFor, formatStreak, type HonorRow } from "@/lib/activity";

// Members signed in 3+ days in a row, longest first. Renders nothing when nobody qualifies.
export function HonorRoll({
  rows,
  limit,
}: {
  rows: HonorRow[];
  limit?: number;
}) {
  if (!rows.length) return null;
  const shown = limit ? rows.slice(0, limit) : rows;
  return (
    <section aria-labelledby="honor-h" className="grid gap-4">
      <div className="grid gap-1 px-1 sm:px-3">
        <h2
          id="honor-h"
          className="font-display text-[clamp(2rem,7vw,3rem)] leading-none font-bold uppercase"
        >
          Honor roll
        </h2>
        <p className="caps text-[15px] text-ink-2">
          Signed in 3 days or more in a row
        </p>
      </div>
      <ol className="border-t border-rule">
        {shown.map((row) => {
          const award = awardFor(row.streak);
          return (
            <li
              key={row.user_id}
              className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-4 border-b border-rule px-1 py-3 sm:px-3"
            >
              <span className="flex min-w-0 flex-wrap items-baseline gap-x-3 gap-y-1">
                <Link
                  href={`/members/${row.user_id}`}
                  className="step truncate font-display text-[clamp(1.4rem,5vw,1.9rem)] leading-tight font-semibold uppercase hover:underline"
                >
                  {row.full_name || "Member"}
                </Link>
                {award ? (
                  <span className="caps border border-ink px-1.5 py-0.5 text-[13px] leading-none">
                    {award}
                  </span>
                ) : null}
              </span>
              <span className="num font-display text-[clamp(1.4rem,5vw,1.9rem)] leading-none font-bold">
                {formatStreak(row.streak)}
              </span>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
