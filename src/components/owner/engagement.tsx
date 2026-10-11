import {
  countText,
  dateText,
  featureState,
  percentText,
  RANGE_LABEL,
  RANGES,
  type Range,
} from "@/lib/owner-metrics";
import type {
  BusyEvent,
  Count,
  EngagementData,
  FeatureId,
} from "@/lib/owner-types";
import {
  Choices,
  DataTable,
  Figure,
  Figures,
  Notice,
  Sheet,
} from "./primitives";

// What each row counts and where the number comes from (migration 0230 has the full taxonomy).
const FEATURE: Record<FeatureId, { label: string; from: string }> = {
  account_created: { label: "Accounts created", from: "New profiles" },
  event_selected: {
    label: "Events joined",
    from: "Event memberships (leaving one removes it)",
  },
  practice_started: {
    label: "Practice runs started",
    from: "Practice attempts, career quizzes included",
  },
  practice_completed: {
    label: "Practice runs submitted",
    from: "Practice attempts",
  },
  exam_completed: { label: "Timed tests submitted", from: "Timed attempts" },
  vocab_round: {
    label: "Flashcard rounds finished",
    from: "Recorded when a round ends",
  },
  vocab_match: { label: "Match games finished", from: "Match results" },
  card_reviews: {
    label: "Cards reviewed",
    from: "Every Know it or Still learning tap",
  },
  resource_opened: {
    label: "Resources opened",
    from: "Recorded when a file or link opens",
  },
  feedback_submitted: {
    label: "Feedback sent",
    from: "Settings > Send feedback",
  },
  question_reported: {
    label: "Questions reported",
    from: "Report this question",
  },
  install_prompt_shown: {
    label: "Install prompt shown",
    from: "Recorded by the install prompt",
  },
  app_installed: { label: "App installed", from: "Recorded on install" },
  push_enabled: {
    label: "Notifications turned on",
    from: "Recorded when push is allowed",
  },
};

type Row = {
  key: string;
  label: string;
  event: string | null;
  count: string;
  people: string;
  from: string;
};

function rowsFor(data: EngagementData): Row[] {
  const rows: Row[] = data.features.map((f) => {
    const meta = FEATURE[f.id];
    const state = featureState(f);
    return {
      key: f.id,
      label: meta.label,
      event: f.event,
      count: state === "untracked" ? "Not recorded yet" : countText(f.count),
      people: state === "untracked" ? "" : countText(f.people),
      from:
        f.source === "tracked" && f.tracked_since
          ? `${meta.from}, since ${dateText(f.tracked_since)}`
          : meta.from,
    };
  });
  const duel = (key: string, label: string, event: string, n: Count): Row =>
    data.duels.available
      ? {
          key,
          label,
          event,
          count: countText(n),
          people: countText(data.duels.people),
          from: "Battles",
        }
      : {
          key,
          label,
          event,
          count: "Not on this database",
          people: "",
          from: "Battles (0095) aren't applied yet",
        };
  rows.push(
    duel(
      "duel_started",
      "Battles started",
      "duel_started",
      data.duels.available ? data.duels.started : null,
    ),
    duel(
      "duel_completed",
      "Battles finished",
      "duel_completed",
      data.duels.available ? data.duels.completed : null,
    ),
    {
      key: "onboarding",
      label: "Onboarding finished",
      event: "onboarding_completed",
      count: "Not counted",
      people: "",
      from: "This site has no onboarding step",
    },
  );
  return rows;
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
  return (
    <>
      <Sheet
        id="engagement-h"
        title="Engagement"
        note="What members do, counted from the records the site already keeps. A few things no record covers are logged on purpose, and say so."
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
        <DataTable
          caption="Each event in the shared list, with its count, the people behind it and where it is counted from."
          rowKey={(r) => r.key}
          rows={rowsFor(data)}
          columns={[
            {
              key: "event",
              header: "Event",
              cell: (r) => (
                <>
                  {r.label}
                  {r.event ? (
                    <span className="block text-[13px] font-normal text-ink-2">
                      {r.event}
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
              cell: (r) => r.people,
            },
            {
              key: "from",
              header: "Counted from",
              cell: (r) => (
                <span className="text-[15px] text-ink-2">{r.from}</span>
              ),
            },
          ]}
        />
      </Sheet>

      <Sheet
        id="busy-h"
        title="Busiest events"
        note="Event rooms by practice and timed runs started in this range."
      >
        {data.events.length === 0 ? (
          <Notice>No runs started in this range.</Notice>
        ) : (
          <DataTable<BusyEvent>
            caption="Event rooms ranked by runs started."
            rowKey={(e) => `${e.name}|${e.event}`}
            rows={data.events}
            columns={[
              {
                key: "name",
                header: "Event",
                cell: (e) => (
                  <>
                    {e.name}
                    {e.event && e.event !== e.name ? (
                      <span className="block text-[13px] font-normal text-ink-2">
                        {e.event}
                      </span>
                    ) : null}
                  </>
                ),
              },
              {
                key: "runs",
                header: "Runs",
                numeric: true,
                cell: (e) => countText(e.runs),
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
