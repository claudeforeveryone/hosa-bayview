import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { DevStatsView } from "@/components/dev-stats";
import { PageTitle } from "@/components/page-title";
import {
  PERIODS,
  PERIOD_LABEL,
  parsePeriod,
  type Period,
} from "@/lib/activity";
import { getDevStats } from "@/lib/dev-stats-data";

// Visible only to the site owner (private.stats_viewers, 0105). Anyone else, or a database without 0105, gets
// the not-found page; the RPC refuses them too, so hiding the link is never the only guard.
export const metadata: Metadata = { title: "Developer" };

export default async function DeveloperPage(props: PageProps<"/developer">) {
  const sp = await props.searchParams;
  const period: Period = parsePeriod(sp.period);
  const rows = await getDevStats(period);
  if (!rows) notFound();

  return (
    <div className="grid grid-cols-1 gap-8">
      <div className="grid gap-4">
        <PageTitle meta="Every member, every number. Only you see this page.">
          Developer
        </PageTitle>
        <nav aria-label="Period">
          <ul className="flex flex-wrap gap-2">
            {PERIODS.map((p) => {
              const on = p === period;
              return (
                <li key={p}>
                  <Link
                    href={p === "all" ? "/developer" : `/developer?period=${p}`}
                    aria-current={on ? "true" : undefined}
                    className={`caps step inline-flex h-11 items-center border px-3.5 text-[16px] ${
                      on
                        ? "border-ink bg-ink text-ground"
                        : "border-rule-strong text-ink hover:bg-band"
                    }`}
                  >
                    {PERIOD_LABEL[p]}
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>
      </div>
      <DevStatsView rows={rows} period={period} />
    </div>
  );
}
