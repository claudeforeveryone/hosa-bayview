import { describe, expect, it } from "vitest";
import { TAXONOMY_EVENTS } from "./analytics";
import { engagementTable } from "./owner-engagement";
import type { EngagementData, FeatureRow } from "./owner-types";

// What owner_engagement (0232) sends for 30 days on a database without battles, with a few small counts.
const feature = (
  id: FeatureRow["id"],
  event: string | null,
  source: FeatureRow["source"],
  count: number | null,
  people: number | null,
  tracked_since: string | null = null,
): FeatureRow => ({ id, event, source, count, people, tracked_since });

const data = (duels: EngagementData["duels"]): EngagementData => ({
  from: "2026-09-12",
  practice: { started: 40, completed: 31, people: 9 },
  exams: { started: 0, completed: 0, people: 0 },
  duels,
  features: [
    feature("account_created", "account_created", "table", 13, 13),
    feature("event_selected", "event_selected", "table", 22, 12),
    feature("practice_started", "practice_started", "table", 40, 9),
    feature("practice_completed", "practice_completed", "table", 31, 8),
    feature("exam_completed", "exam_completed", "table", 0, 0),
    feature(
      "vocab_round",
      "vocab_session_completed",
      "tracked",
      12,
      null,
      "2026-10-01T14:00:00Z",
    ),
    feature("vocab_match", "vocab_session_completed", "table", 0, 0),
    feature("card_reviews", null, "table", 310, 7),
    feature("resource_opened", "resource_opened", "tracked", 0, 0, null),
    feature("feedback_submitted", "feedback_submitted", "table", null, null),
    feature("question_reported", "feedback_submitted", "tracked", 0, 0, null),
    feature("install_prompt_shown", "install_prompt_shown", "tracked", 0, 0),
    feature("app_installed", "app_installed", "tracked", 0, 0),
    feature("push_enabled", "push_enabled", "tracked", 0, 0),
  ],
  events: [],
});

const covered = (t: ReturnType<typeof engagementTable>) =>
  new Set([
    ...t.rows.flatMap((r) => (r.event ? [r.event] : [])),
    ...t.notCounted.map((n) => n.event),
  ]);

describe("engagementTable", () => {
  it("accounts for every taxonomy event, with or without battles", () => {
    const without = engagementTable(data({ available: false }));
    const withBattles = engagementTable(
      data({
        available: true,
        started: 6,
        completed: 5,
        people: null,
        completed_people: null,
      }),
    );
    expect([...covered(without)].sort()).toEqual([...TAXONOMY_EVENTS].sort());
    expect([...covered(withBattles)].sort()).toEqual(
      [...TAXONOMY_EVENTS].sort(),
    );
  });

  it("folds battles into the note when they aren't on the database, never as rows saying so", () => {
    const t = engagementTable(data({ available: false }));
    expect(t.rows.map((r) => r.key)).not.toContain("duel_started");
    expect(
      t.rows.some((r) => /Not on this database|Not counted/.test(r.count)),
    ).toBe(false);
    expect(t.notCounted.map((n) => n.event)).toEqual([
      "onboarding_completed",
      "duel_started",
      "duel_completed",
    ]);
  });

  it("shows battle rows with their counts once battles exist", () => {
    const t = engagementTable(
      data({
        available: true,
        started: 6,
        completed: 5,
        people: null,
        completed_people: null,
      }),
    );
    const started = t.rows.find((r) => r.key === "duel_started");
    expect(started).toMatchObject({ count: "6", people: "Under\u00a05" });
    expect(t.notCounted.map((n) => n.event)).toEqual(["onboarding_completed"]);
  });

  // Ten people started battles, six of them were in one that finished: the finished row says six, not ten.
  it("counts the people behind finished battles apart from everyone who started one", () => {
    const t = engagementTable(
      data({
        available: true,
        started: 12,
        completed: 8,
        people: 10,
        completed_people: 6,
      }),
    );
    const byKey = Object.fromEntries(t.rows.map((r) => [r.key, r]));
    expect(byKey.duel_started).toMatchObject({ count: "12", people: "10" });
    expect(byKey.duel_completed).toMatchObject({ count: "8", people: "6" });
  });

  it("marks rows that share an event as counting toward it, and leaves one-to-one rows plain", () => {
    const rows = engagementTable(data({ available: false })).rows;
    const byKey = Object.fromEntries(rows.map((r) => [r.key, r]));
    expect(byKey.vocab_round).toMatchObject({
      event: "vocab_session_completed",
      shared: true,
    });
    expect(byKey.vocab_match.shared).toBe(true);
    expect(byKey.question_reported).toMatchObject({
      label: "Question reports sent",
      event: "feedback_submitted",
      shared: true,
    });
    expect(byKey.practice_started.shared).toBe(false);
    expect(byKey.card_reviews.event).toBeNull();
  });

  it("says never recorded, hidden and real zero apart", () => {
    const byKey = Object.fromEntries(
      engagementTable(data({ available: false })).rows.map((r) => [r.key, r]),
    );
    expect(byKey.resource_opened).toMatchObject({
      count: "Not recorded yet",
      people: "",
    });
    expect(byKey.feedback_submitted.count).toBe("Under\u00a05");
    expect(byKey.exam_completed.count).toBe("0");
    expect(byKey.vocab_round.from).toBe(
      "Recorded when a round ends, since Oct 1, 2026",
    );
    // Reports are recorded from the day the button ships, one per report sent.
    expect(byKey.question_reported).toMatchObject({
      count: "Not recorded yet",
      from: "Each report sent from Report this question",
    });
  });
});
