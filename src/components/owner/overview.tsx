import { countText, deltaText, percentText } from "@/lib/owner-metrics";
import type { OwnerOverview } from "@/lib/owner-types";
import { Figure, Figures, Ledger, Sheet } from "./primitives";

// Who is here and who keeps coming back. Active means the site was open that Toronto day (the heartbeat writes it),
// the same measure the leaderboard's sign-in streak uses.
export function OverviewSection({ data }: { data: OwnerOverview }) {
  const weekGroup =
    data.returning_7d === null || data.first_week_7d === null
      ? null
      : data.returning_7d + data.first_week_7d;
  return (
    <>
      <Sheet
        id="overview-h"
        title="This week"
        note="Counts from 1 to 4 show as Under 5, so no one can be picked out."
      >
        <Figures label="Headline figures">
          <Figure label="Members" value={countText(data.members)} />
          <Figure label="Active today" value={countText(data.dau)} />
          <Figure
            label="Active, 7 days"
            value={countText(data.wau)}
            note={deltaText(data.wau, data.wau_prev, "the 7 days before")}
          />
          <Figure label="Active, 30 days" value={countText(data.mau)} />
        </Figures>
      </Sheet>

      <div className="grid grid-cols-[minmax(0,1fr)] gap-12 xl:grid-cols-2 xl:gap-10">
        <Sheet
          id="back-h"
          title="Coming back"
          note="This week's active members: back from an earlier day, or here for the first time. The two hide together."
        >
          <Ledger
            label="Returning and first-week members"
            rows={[
              {
                label: "Returning",
                value: countText(data.returning_7d),
                note: percentText(data.returning_7d, weekGroup)
                  ? `${percentText(data.returning_7d, weekGroup)} of this week's group`
                  : null,
              },
              { label: "First week", value: countText(data.first_week_7d) },
            ]}
          />
        </Sheet>
        <Sheet
          id="new-h"
          title="New members"
          note={`Accounts created, Toronto days up to today (${data.today}).`}
        >
          <Ledger
            label="New members"
            rows={[
              { label: "Last 7 days", value: countText(data.new_7d) },
              { label: "Last 30 days", value: countText(data.new_30d) },
            ]}
          />
        </Sheet>
      </div>
    </>
  );
}
