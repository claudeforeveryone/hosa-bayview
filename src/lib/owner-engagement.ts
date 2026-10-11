// The owner console's Engagement table, built from owner_engagement (0232). Pure, so the test can hold it to the
// shared taxonomy: every event is either counted in a row or named in the one note under the table. Rows never say
// "not on this database" or "not counted": those events go in the note instead.
import type { TaxonomyEvent } from "./analytics";
import { countText, dateText, featureState } from "./owner-metrics";
import type { Count, EngagementData, FeatureId } from "./owner-types";

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
    label: "Question reports sent",
    from: "Each report sent from Report this question",
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

export type EngagementRow = {
  key: string;
  label: string;
  // The taxonomy event this row is, or one of the rows counting toward (`shared`). Null: not a taxonomy event.
  event: string | null;
  shared: boolean;
  count: string;
  people: string;
  from: string;
};

export type NotCounted = { event: TaxonomyEvent; why: string };

export function engagementTable(data: EngagementData): {
  rows: EngagementRow[];
  notCounted: NotCounted[];
} {
  const rows: Omit<EngagementRow, "shared">[] = data.features.map((f) => {
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
  const notCounted: NotCounted[] = [
    { event: "onboarding_completed", why: "this site has no onboarding step" },
  ];
  if (data.duels.available) {
    const duel = (
      key: TaxonomyEvent,
      label: string,
      n: Count,
      people: Count,
    ) => ({
      key,
      label,
      event: key,
      count: countText(n),
      people: countText(people),
      from: "Battles",
    });
    const d = data.duels;
    rows.push(
      duel("duel_started", "Battles started", d.started, d.people),
      duel(
        "duel_completed",
        "Battles finished",
        d.completed,
        d.completed_people,
      ),
    );
  } else {
    const why = "battles aren't on this database yet";
    notCounted.push(
      { event: "duel_started", why },
      { event: "duel_completed", why },
    );
  }
  const uses = new Map<string, number>();
  for (const r of rows)
    if (r.event) uses.set(r.event, (uses.get(r.event) ?? 0) + 1);
  return {
    rows: rows.map((r) => ({
      ...r,
      shared: r.event !== null && (uses.get(r.event) ?? 0) > 1,
    })),
    notCounted,
  };
}
