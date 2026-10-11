import { Fragment } from "react";
import { engagementTable, type EngagementRow } from "@/lib/owner-engagement";
import {
  countText,
  percentText,
  RANGE_LABEL,
  RANGES,
  type Range,
} from "@/lib/owner-metrics";
import type { BusyEvent, EngagementData } from "@/lib/owner-types";
import {
  Choices,
  DataTable,
  Figure,
  Figures,
  Notice,
  Sheet,
} from "./primitives";

// An event name is one long snake_case word ("vocab_session_completed"). On a narrow phone it may break after an
// underscore, so it can't hold the table wider than the screen.
function breakable(code: string) {
  const parts = code.split("_");
  return parts.map((part, i) => (
    <Fragment key={i}>
      {part}
      {i < parts.length - 1 ? (
        <>
          _<wbr />
        </>
      ) : null}
    </Fragment>
  ));
}

// "onboarding_completed (this site has no onboarding step)", joined into one sentence for the note under the table.
function notCountedText(items: { event: string; why: string }[]): string {
  const byWhy = new Map<string, string[]>();
  for (const i of items)
    byWhy.set(i.why, [...(byWhy.get(i.why) ?? []), i.event]);
  return [...byWhy]
    .map(([why, events]) => `${events.join(" and ")} (${why})`)
    .join("; ");
}

export function EngagementSection({
  base,
  range,
  data,
  extra,
}: {
  base: string;
  range: Range;
  data: EngagementData;
  extra?: Record<string, string>;
}) {
  const href = (r: Range) => {
    const search = new URLSearchParams({ ...extra, tab: "engagement" });
    if (r !== "30d") search.set("range", r);
    return `${base}?${search.toString()}`;
  };
  const reviews = data.features.find((f) => f.id === "card_reviews");
  const finished = percentText(data.practice.completed, data.practice.started);
  const table = engagementTable(data);
  return (
    <>
      <Sheet
        id="engagement-h"
        title="Engagement"
        note="What members do, from records the site already keeps. Flashcard rounds, opened resources, question reports, the install prompt, app installs and notifications have no record of their own, so the site logs them just for this page."
        actions={
          <Choices
            label="Range"
            items={RANGES.map((r) => ({
              href: href(r),
              text: RANGE_LABEL[r],
              current: r === range,
            }))}
          />
        }
      >
        <Figures label="Practice and study">
          <Figure
            label="Practice started"
            value={countText(data.practice.started)}
          />
          <Figure
            label="Practice submitted"
            value={countText(data.practice.completed)}
            note={finished ? `${finished} of those started` : null}
          />
          <Figure
            label="Timed tests submitted"
            value={countText(data.exams.completed)}
            note={
              data.exams.started === 0
                ? "None started yet"
                : `${countText(data.exams.started)} started`
            }
          />
          <Figure label="Cards reviewed" value={countText(reviews?.count)} />
        </Figures>
      </Sheet>

      <Sheet
        id="features-h"
        title="Every tracked event"
        note="Not recorded yet means nothing has logged one so far, which is different from zero."
      >
        <DataTable<EngagementRow>
          caption="Each event in the shared list, with its count, the people behind it and where it is counted from."
          stackOnPhone={false}
          rowKey={(r) => r.key}
          rows={table.rows}
          columns={[
            {
              key: "event",
              header: "Event",
              cell: (r) => (
                <>
                  {r.label}
                  {r.event ? (
                    <span className="block text-13 font-normal text-ink-2">
                      {r.shared ? "Counts toward " : null}
                      {breakable(r.event)}
                    </span>
                  ) : null}
                </>
              ),
            },
            {
              key: "count",
              header: "Count",
              numeric: true,
              cell: (r) => r.count,
            },
            {
              key: "people",
              header: "People",
              numeric: true,
              // Never recorded: no people figure, so phones skip the empty pair.
              when: (r) => r.people !== "",
              cell: (r) => r.people,
            },
            {
              key: "from",
              header: "Counted from",
              hideOnPhone: true,
              cell: (r) => (
                <span className="text-15 text-ink-2">{r.from}</span>
              ),
            },
          ]}
        />
        {table.notCounted.length ? (
          <p className="max-w-[68ch] text-15 text-ink-2">
            Not counted here: {notCountedText(table.notCounted)}.
          </p>
        ) : null}
      </Sheet>

      <Sheet
        id="busy-h"
        title="Busiest events"
        note="Event rooms ranked by practice and timed runs started in this range. Rooms with fewer than 5 runs aren't listed."
      >
        {data.events.length === 0 ? (
          <Notice>No event room had 5 or more runs in this range.</Notice>
        ) : (
          <DataTable<BusyEvent & { rank: number }>
            caption="Event rooms ranked by runs started, busiest first."
            stackOnPhone={false}
            rowKey={(e) => e.id}
            rows={data.events.map((e, i) => ({ ...e, rank: i + 1 }))}
            columns={[
              {
                key: "name",
                header: "Event, busiest first",
                cell: (e) => (
                  <span className="grid grid-cols-[2ch_minmax(0,1fr)] gap-x-3">
                    <span className="num text-ink-2">{e.rank}</span>
                    <span>
                      {e.name}
                      {e.event && e.event !== e.name ? (
                        <span className="block text-13 font-normal text-ink-2">
                          {e.event}
                        </span>
                      ) : null}
                    </span>
                  </span>
                ),
              },
              {
                key: "people",
                header: "People",
                numeric: true,
                cell: (e) => countText(e.people),
              },
            ]}
          />
        )}
      </Sheet>
    </>
  );
}
