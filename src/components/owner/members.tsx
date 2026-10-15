import { DevStatsView } from "@/components/dev-stats";
import { PERIODS, PERIOD_LABEL, type Period } from "@/lib/activity";
import type { DevStatsRow } from "@/lib/dev-stats";
import { EloSetter } from "./elo-setter";
import { Choices, Sheet } from "./primitives";

// The per-member table that was the whole developer page before the console (0105), kept as it was built:
// every member by name with time, clicks, questions, tests, flashcards and Elo. It is per person on purpose, so
// the small-count rule of the other sections doesn't apply here.
export function MembersSection({
  base,
  period,
  rows,
  battles,
  extra,
}: {
  base: string;
  period: Period;
  rows: DevStatsRow[];
  battles: boolean;
  extra?: Record<string, string>;
}) {
  const href = (p: Period) => {
    const search = new URLSearchParams({ ...extra, tab: "members" });
    if (p !== "all") search.set("period", p);
    return `${base}?${search.toString()}`;
  };
  return (
    <Sheet
      id="members-h"
      title="Members"
      note="Every member, every number. Time counts only active minutes near study; clicks are capped at 300 a minute."
      actions={
        <Choices
          label="Period"
          items={PERIODS.map((p) => ({
            href: href(p),
            text: PERIOD_LABEL[p],
            current: p === period,
          }))}
        />
      }
    >
      <EloSetter members={rows} />
      <DevStatsView rows={rows} period={period} battles={battles} />
    </Sheet>
  );
}
