// OWNER-FIXTURE: made-up numbers and names for the dev-only owner console gallery (src/app/(app)/dev/owner/
// page.dev.tsx). Only that page imports this file, and that page is never built for production (next.config.ts
// adds the .dev.tsx page extension in the dev server only), so none of this ships. Nothing here is real data.
import type { DevStatsRow } from "./dev-stats";
import type { FeedbackFilter } from "./owner-metrics";
import type {
  ContentData,
  EngagementData,
  FeedbackQueue,
  FeedbackRow,
  GrowthData,
  OwnerOverview,
  AuditRow,
  SystemData,
} from "./owner-types";

export const FIXTURE_MARKER = "OWNER-FIXTURE";

const TODAY = "2026-10-11";
const ROOM = "00000000-0000-4000-8000-00000000f0";

function day(offset: number): string {
  const d = new Date(`${TODAY}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + offset);
  return d.toISOString().slice(0, 10);
}

export const overviewFixture: OwnerOverview = {
  today: TODAY,
  members: 184,
  new_7d: 9,
  new_30d: 31,
  dau: 27,
  wau: 96,
  wau_prev: 88,
  mau: 151,
  returning_7d: 81,
  first_week_7d: 15,
};

// Thirty days, oldest first. Quiet days fall under 5 (null), as the database would send them.
const ACTIVE = [
  34,
  41,
  29,
  12,
  null,
  38,
  44,
  40,
  36,
  31,
  9,
  null,
  45,
  49,
  47,
  42,
  33,
  11,
  null,
  52,
  48,
  46,
  39,
  35,
  8,
  6,
  43,
  51,
  47,
  27,
];

export const growthFixture: GrowthData = {
  step: "day",
  from: day(-29),
  to: TODAY,
  new_total: 31,
  active_total: 151,
  // Some quiet days had 1 to 4 new members, so the database withholds the whole new series for this range.
  new_by_bucket: false,
  buckets: ACTIVE.map((active, i) => ({
    start: day(i - 29),
    end: day(i - 29),
    active,
    new: null,
  })),
};

// Monday-to-Sunday weeks from `from` to today, as owner_growth sends them for 90 days and all time: the first week
// starts on the range's first day (part of a week when that isn't a Monday) and the last one ends today.
function weeks(from: string): { start: string; end: string }[] {
  const out: { start: string; end: string }[] = [];
  let start = from;
  while (start <= TODAY) {
    const d = new Date(`${start}T12:00:00Z`);
    const sunday = new Date(d);
    sunday.setUTCDate(d.getUTCDate() + (6 - ((d.getUTCDay() + 6) % 7)));
    const end = sunday.toISOString().slice(0, 10);
    out.push({ start, end: end > TODAY ? TODAY : end });
    sunday.setUTCDate(sunday.getUTCDate() + 1);
    start = sunday.toISOString().slice(0, 10);
  }
  return out;
}

// 90 days: 13 weeks from Tuesday Jul 14. Every week had 0 or 5+ new members, so the per-week series is shown and
// adds up to the total.
const NEW_90 = [0, 6, 5, 0, 7, 9, 5, 0, 12, 18, 9, 6, 8];
const ACTIVE_90 = [38, 61, 64, 22, 70, 88, 91, 47, 112, 131, 126, 120, 118];
export const growth90Fixture: GrowthData = {
  step: "week",
  from: day(-89),
  to: TODAY,
  new_total: NEW_90.reduce((a, b) => a + b, 0),
  active_total: 168,
  new_by_bucket: true,
  buckets: weeks(day(-89)).map((w, i) => ({
    ...w,
    new: NEW_90[i],
    active: ACTIVE_90[i],
  })),
};

// All time: from the first sign-up (Wednesday Feb 18), weekly. A quiet week had 1 to 4 new members, so the series
// is withheld; summer weeks fall under 5 active.
export const growthAllFixture: GrowthData = (() => {
  const all = weeks("2026-02-18");
  return {
    step: "week",
    from: "2026-02-18",
    to: TODAY,
    new_total: 184,
    active_total: 179,
    new_by_bucket: false,
    buckets: all.map((w, i) => ({
      ...w,
      new: null,
      active:
        i >= 17 && i <= 20 ? null : Math.round(20 + i * 3.4 + ((i * 37) % 11)),
    })),
  };
})();

// The 7-day view of the daily fixture.
export const growth7Fixture: GrowthData = {
  ...growthFixture,
  from: day(-6),
  new_total: 9,
  active_total: 96,
  buckets: growthFixture.buckets.slice(-7),
};

export const engagementFixture: EngagementData = {
  from: day(-29),
  practice: { started: 1240, completed: 912, people: 118 },
  exams: { started: 301, completed: 287, people: 74 },
  duels: { available: false },
  features: [
    {
      id: "account_created",
      event: "account_created",
      source: "table",
      count: 31,
      people: 31,
      tracked_since: null,
    },
    {
      id: "event_selected",
      event: "event_selected",
      source: "table",
      count: 58,
      people: 29,
      tracked_since: null,
    },
    {
      id: "practice_started",
      event: "practice_started",
      source: "table",
      count: 1240,
      people: 118,
      tracked_since: null,
    },
    {
      id: "practice_completed",
      event: "practice_completed",
      source: "table",
      count: 912,
      people: 109,
      tracked_since: null,
    },
    {
      id: "exam_completed",
      event: "exam_completed",
      source: "table",
      count: 287,
      people: 74,
      tracked_since: null,
    },
    {
      id: "vocab_round",
      event: "vocab_session_completed",
      source: "tracked",
      count: 214,
      people: 63,
      tracked_since: `${day(-12)}T14:00:00Z`,
    },
    {
      id: "vocab_match",
      event: "vocab_session_completed",
      source: "table",
      count: 406,
      people: 88,
      tracked_since: null,
    },
    {
      id: "card_reviews",
      event: null,
      source: "table",
      count: 8410,
      people: 97,
      tracked_since: null,
    },
    {
      id: "resource_opened",
      event: "resource_opened",
      source: "tracked",
      count: 133,
      people: 52,
      tracked_since: `${day(-12)}T14:00:00Z`,
    },
    {
      id: "feedback_submitted",
      event: "feedback_submitted",
      source: "table",
      count: 12,
      people: 9,
      tracked_since: null,
    },
    {
      id: "question_reported",
      event: "feedback_submitted",
      source: "tracked",
      count: 7,
      people: null,
      tracked_since: `${day(-12)}T14:00:00Z`,
    },
    {
      id: "install_prompt_shown",
      event: "install_prompt_shown",
      source: "tracked",
      count: null,
      people: null,
      tracked_since: `${day(-3)}T14:00:00Z`,
    },
    {
      id: "app_installed",
      event: "app_installed",
      source: "tracked",
      count: 0,
      people: 0,
      tracked_since: null,
    },
    {
      id: "push_enabled",
      event: "push_enabled",
      source: "tracked",
      count: 0,
      people: 0,
      tracked_since: null,
    },
  ],
  events: [
    {
      id: `${ROOM}01`,
      name: "Sample Event Alpha",
      event: "Medical Terminology",
      people: 41,
    },
    {
      id: `${ROOM}02`,
      name: "Sample Event Bravo",
      event: "Pathophysiology",
      people: 28,
    },
    {
      id: `${ROOM}03`,
      name: "Sample Event Charlie",
      event: "Pharmacology",
      people: 22,
    },
    {
      id: `${ROOM}04`,
      name: "Sample Event Delta",
      event: "Medical Math",
      people: 15,
    },
    {
      id: `${ROOM}07`,
      name: "Sample Event Echo",
      event: "Nutrition",
      people: null,
    },
  ],
};

export const contentFixture: ContentData = {
  questions: 6420,
  tests: 214,
  published_tests: 188,
  missing_explanations: 2310,
  open_reports: 5,
  open_asks: 1,
  duplicate_groups: 37,
  per_event: [
    {
      id: `${ROOM}01`,
      name: "Sample Event Alpha",
      event: "Medical Terminology",
      kind: "class",
      tests: 31,
      questions: 1012,
      missing_explanations: 140,
      repeated: 12,
      open_reports: 2,
    },
    {
      id: `${ROOM}02`,
      name: "Sample Event Bravo",
      event: "Pathophysiology",
      kind: "class",
      tests: 22,
      questions: 804,
      missing_explanations: 611,
      repeated: 0,
      open_reports: 2,
    },
    {
      id: `${ROOM}03`,
      name: "Sample Event Charlie",
      event: "Pharmacology",
      kind: "class",
      tests: 18,
      questions: 702,
      missing_explanations: 702,
      repeated: 3,
      open_reports: 0,
    },
    {
      id: `${ROOM}04`,
      name: "Sample Event Delta",
      event: "Medical Math",
      kind: "class",
      tests: 9,
      questions: 260,
      missing_explanations: 0,
      repeated: 0,
      open_reports: 1,
    },
    {
      id: `${ROOM}05`,
      name: "Sample Mock Round",
      event: "Mixed",
      kind: "competition",
      tests: 2,
      questions: 100,
      missing_explanations: 100,
      repeated: 0,
      open_reports: 0,
    },
    {
      id: `${ROOM}06`,
      name: "Sample Event Foxtrot",
      event: "Dental Terminology",
      kind: "class",
      tests: 0,
      questions: 0,
      missing_explanations: 0,
      repeated: 0,
      open_reports: 0,
    },
  ],
  reported: [
    {
      question_id: "00000000-0000-4000-8000-00000000e001",
      test_id: "00000000-0000-4000-8000-00000000d001",
      classroom_id: `${ROOM}01`,
      test_title: "Sample Practice Set 3",
      room: "Sample Event Alpha",
      pos: 14,
      prompt: "Sample question: which suffix means inflammation?",
      reasons: ["wrong_answer"],
      reports: 2,
      last_at: `${day(-1)}T19:42:00Z`,
    },
    {
      question_id: "00000000-0000-4000-8000-00000000e002",
      test_id: "00000000-0000-4000-8000-00000000d002",
      classroom_id: `${ROOM}02`,
      test_title: "Sample Unit Test 1",
      room: "Sample Event Bravo",
      pos: 3,
      prompt:
        "Sample question: which of these is not a sign of acute inflammation?",
      reasons: ["unclear", "typo"],
      reports: 2,
      last_at: `${day(-4)}T15:10:00Z`,
    },
    {
      question_id: "00000000-0000-4000-8000-00000000e003",
      test_id: "00000000-0000-4000-8000-00000000d004",
      classroom_id: `${ROOM}04`,
      test_title: "Sample Dosage Drill",
      room: "Sample Event Delta",
      pos: 7,
      prompt: "Sample question: how many milligrams are in 2.5 grams?",
      reasons: ["other"],
      reports: 1,
      last_at: `${day(-6)}T20:05:00Z`,
    },
  ],
  duplicates: [
    {
      stem: "sample question: which suffix means inflammation",
      example: "Sample question: Which suffix means inflammation?",
      test_id: "00000000-0000-4000-8000-00000000d001",
      classroom_id: `${ROOM}01`,
      copies: 4,
      tests: 3,
      rooms: ["Sample Event Alpha"],
    },
    {
      stem: "sample question: the prefix brady- means",
      example: "Sample question: The prefix brady- means:",
      test_id: "00000000-0000-4000-8000-00000000d003",
      classroom_id: `${ROOM}01`,
      copies: 3,
      tests: 2,
      rooms: ["Sample Event Alpha", "Sample Mock Round"],
    },
    {
      stem: "sample question: convert 5 ml to teaspoons",
      example: "Sample question: Convert 5 mL to teaspoons.",
      test_id: "00000000-0000-4000-8000-00000000d004",
      classroom_id: `${ROOM}04`,
      copies: 2,
      tests: 2,
      rooms: ["Sample Event Delta"],
    },
  ],
};

// Newest first, as owner_feedback sends them: two new, one planned, two done and one won't fix, each closed one with
// the note it was closed with. The gallery filters these by ?status the way the database does.
const feedbackRows: FeedbackRow[] = [
  {
    id: "c0000001-0000-4000-8000-00000000c001",
    category: "bug",
    body: "Sample feedback: the timer kept running after I submitted a timed test on my phone.",
    build: "a1b2c3d",
    status: "new",
    priority: "high",
    resolution: "",
    created_at: `${TODAY}T13:05:00Z`,
    updated_at: `${TODAY}T14:02:00Z`,
    triaged_at: `${TODAY}T14:02:00Z`,
    sent_by: "Sample Trainee A",
  },
  {
    id: "c0000002-0000-4000-8000-00000000c002",
    category: "idea",
    body: "Sample feedback: a dark calendar view would be easier to read at night.",
    build: null,
    status: "planned",
    priority: "normal",
    resolution: "Sample note: after the calendar rework.",
    created_at: `${day(-3)}T22:40:00Z`,
    updated_at: `${day(-2)}T09:00:00Z`,
    triaged_at: `${day(-2)}T09:00:00Z`,
    sent_by: "Sample Trainee B",
  },
  {
    id: "c0000003-0000-4000-8000-00000000c003",
    category: "other",
    body: "Sample feedback: thanks for the flashcards.",
    build: "a1b2c3d",
    status: "new",
    priority: "low",
    resolution: "",
    created_at: `${day(-5)}T17:20:00Z`,
    updated_at: `${day(-5)}T17:20:00Z`,
    triaged_at: null,
    sent_by: "Sample Trainer C",
  },
  {
    id: "c0000004-0000-4000-8000-00000000c004",
    category: "bug",
    body: "Sample feedback: the leaderboard showed me twice after I changed my name.",
    build: "9f8e7d6",
    status: "done",
    priority: "high",
    resolution:
      "Sample note: fixed in the next build. Names now update everywhere at once.",
    created_at: `${day(-8)}T15:00:00Z`,
    updated_at: `${day(-6)}T21:10:00Z`,
    triaged_at: `${day(-6)}T21:10:00Z`,
    sent_by: "Sample Trainee D",
  },
  {
    id: "c0000005-0000-4000-8000-00000000c005",
    category: "idea",
    body: "Sample feedback: shuffle flashcards by default.",
    build: "9f8e7d6",
    status: "done",
    priority: "normal",
    resolution: "Sample note: added. Decks start shuffled now.",
    created_at: `${day(-12)}T19:30:00Z`,
    updated_at: `${day(-10)}T17:00:00Z`,
    triaged_at: `${day(-10)}T17:00:00Z`,
    sent_by: "Sample Trainee A",
  },
  {
    id: "c0000006-0000-4000-8000-00000000c006",
    category: "idea",
    body: "Sample feedback: could the site send texts before a test?",
    build: null,
    status: "wont_fix",
    priority: "low",
    resolution:
      "Sample note: texts cost money per message. Push notifications cover this once the app is installed.",
    created_at: `${day(-15)}T12:00:00Z`,
    updated_at: `${day(-14)}T10:20:00Z`,
    triaged_at: `${day(-14)}T10:20:00Z`,
    sent_by: "Sample Trainee E",
  },
];

export const feedbackFixture: FeedbackQueue = {
  counts: { new: 2, planned: 1, done: 2, wont_fix: 1 },
  rows: feedbackRows,
};

// What owner_feedback(p_status) returns for one filter: the same counts, and only the rows that match it.
export function feedbackFixtureFor(
  filter: FeedbackFilter,
  small: boolean,
): FeedbackQueue {
  if (small) return smallFeedbackFixture;
  return {
    counts: feedbackFixture.counts,
    rows: feedbackRows.filter((r) =>
      filter === "all"
        ? true
        : filter === "open"
          ? r.status === "new" || r.status === "planned"
          : r.status === filter,
    ),
  };
}

// Each line as the database writes it: role changes "old → new" (0052), the chapter code's fixed text (0090),
// triage in the console's words (0232). Triage lines match the feedback fixture: what changed, never the text.
export const auditFixture: AuditRow[] = [
  {
    id: 909,
    created_at: `${TODAY}T14:02:00Z`,
    actor_name: "Sample Owner",
    action: "feedback",
    target_name: "feedback #c0000001",
    detail: "priority Normal to High",
  },
  {
    id: 908,
    created_at: `${day(-1)}T18:30:00Z`,
    actor_name: "Sample Executive",
    action: "role",
    target_name: "Sample Trainee D",
    detail: "trainee → trainer",
  },
  {
    id: 907,
    created_at: `${day(-2)}T11:15:00Z`,
    actor_name: "Sample Executive",
    action: "title",
    target_name: "Sample Trainer C",
    detail: "Event lead",
  },
  {
    id: 906,
    created_at: `${day(-2)}T09:00:00Z`,
    actor_name: "Sample Owner",
    action: "feedback",
    target_name: "feedback #c0000002",
    detail: "status New to Planned, note edited",
  },
  {
    id: 905,
    created_at: `${day(-6)}T21:10:00Z`,
    actor_name: "Sample Owner",
    action: "feedback",
    target_name: "feedback #c0000004",
    detail: "status New to Done, priority Normal to High, note edited",
  },
  {
    id: 904,
    created_at: `${day(-6)}T20:45:00Z`,
    actor_name: "Sample Executive",
    action: "warned",
    target_name: "Sample Trainee E",
    detail: "Sample warning text",
  },
  {
    id: 903,
    created_at: `${day(-9)}T16:00:00Z`,
    actor_name: "Sample Executive",
    action: "chapter_code",
    target_name: "",
    detail: "Chapter code changed",
  },
  {
    id: 902,
    created_at: `${day(-10)}T17:00:00Z`,
    actor_name: "Sample Executive",
    action: "feedback",
    target_name: "feedback #c0000005",
    detail: "status New to Done, note edited",
  },
  {
    id: 901,
    created_at: `${day(-14)}T10:20:00Z`,
    actor_name: "Sample Owner",
    action: "feedback",
    target_name: "feedback #c0000006",
    detail: "status New to Won't fix, note edited",
  },
  // A passcode claim names the claimer as its target; the log leaves it off.
  {
    id: 900,
    created_at: `${day(-20)}T15:10:00Z`,
    actor_name: "Sample Executive",
    action: "passcode_used",
    target_name: "Sample Executive",
    detail: "",
  },
];

export const systemFixture: SystemData = {
  db_time: `${TODAY}T14:20:31Z`,
  features: {
    battles: false,
    chapter_code: false,
    push: false,
    analytics: true,
    feedback: true,
  },
  migrations: {
    count: 141,
    latest: ["0232_owner_console", "0231_feedback", "0230_analytics_events"],
  },
  analytics: { stored: true, oldest: `${day(-12)}T08:00:00Z` },
};

const MEMBER = "00000000-0000-4000-8000-00000000b0";
const member = (
  n: number,
  name: string,
  role: DevStatsRow["role"],
  minutes: number,
  answered: number,
  correct: number,
  seenDaysAgo: number,
): DevStatsRow => ({
  user_id: `${MEMBER}${String(n).padStart(2, "0")}`,
  full_name: name,
  role,
  title: null,
  joined_at: `${day(-120 + n * 7)}T12:00:00Z`,
  banned: false,
  last_seen: `${day(-seenDaysAgo)}T18:00:00Z`,
  seen_today: seenDaysAgo === 0,
  seen_week: seenDaysAgo < 7,
  minutes_all: minutes,
  minutes_7d: Math.round(minutes / 6),
  minutes_today: seenDaysAgo === 0 ? 25 : 0,
  minutes_period: minutes,
  clicks_all: minutes * 14,
  clicks_7d: Math.round((minutes * 14) / 6),
  clicks_today: seenDaysAgo === 0 ? 300 : 0,
  clicks_period: minutes * 14,
  answered,
  correct,
  attempts: Math.round(answered / 25),
  finished: Math.round(answered / 30),
  reviews: answered * 2,
  battle_wins: 0,
  classrooms: 2,
  elo: correct * 5 + answered * 2,
  elo_gain: Math.round(correct / 3),
});

export const membersFixture: DevStatsRow[] = [
  member(1, "Sample Trainee A", "trainee", 1260, 1840, 1512, 0),
  member(2, "Sample Trainee B", "trainee", 940, 1210, 902, 0),
  member(3, "Sample Trainer C", "trainer", 610, 400, 371, 1),
  member(4, "Sample Trainee D", "trainee", 455, 720, 498, 2),
  member(5, "Sample Trainee E", "trainee", 120, 96, 51, 9),
  member(6, "Sample Executive", "executive", 380, 210, 199, 0),
];

// A small chapter, the size HOSA Bayview is today: 13 members who all joined this month, activity on a handful of
// days, most of them under 5 people. This is what the owner sees on day one: mostly Under 5, outlined columns.
export const smallOverviewFixture: OwnerOverview = {
  today: TODAY,
  members: 13,
  new_7d: null,
  new_30d: 13,
  dau: null,
  wau: 7,
  wau_prev: 0,
  mau: 9,
  returning_7d: null,
  first_week_7d: null,
};

const SMALL_ACTIVE: (number | null)[] = Array.from({ length: 30 }, (_, i) =>
  i === 27 ? 7 : i === 21 || i === 25 || i === 29 ? null : 0,
);

export const smallGrowthFixture: GrowthData = {
  step: "day",
  from: day(-29),
  to: TODAY,
  new_total: 13,
  active_total: 9,
  new_by_bucket: false,
  buckets: SMALL_ACTIVE.map((active, i) => ({
    start: day(i - 29),
    end: day(i - 29),
    active,
    new: null,
  })),
};

// The small chapter by week (90 days): almost every week under 5 active, and the new series withheld.
export const smallGrowth90Fixture: GrowthData = {
  step: "week",
  from: day(-89),
  to: TODAY,
  new_total: 13,
  active_total: 11,
  new_by_bucket: false,
  buckets: weeks(day(-89)).map((w, i) => ({
    ...w,
    new: null,
    active: i === 10 ? 6 : i === 12 ? 9 : i < 8 ? 0 : null,
  })),
};

export const smallEngagementFixture: EngagementData = {
  ...engagementFixture,
  practice: { started: 23, completed: 15, people: 7 },
  exams: { started: 0, completed: 0, people: 0 },
  features: engagementFixture.features.map((f) => {
    const small: Partial<Record<typeof f.id, [number | null, number | null]>> =
      {
        account_created: [13, 13],
        event_selected: [19, 11],
        practice_started: [23, 7],
        practice_completed: [15, 6],
        exam_completed: [0, 0],
        vocab_round: [null, null],
        vocab_match: [0, 0],
        card_reviews: [212, 6],
        resource_opened: [null, null],
        feedback_submitted: [0, 0],
        question_reported: [0, 0],
      };
    const pick = small[f.id];
    return pick ? { ...f, count: pick[0], people: pick[1] } : f;
  }),
  events: [
    {
      id: `${ROOM}01`,
      name: "Sample Event Alpha",
      event: "Medical Terminology",
      people: null,
    },
  ],
};

export const smallFeedbackFixture: FeedbackQueue = {
  counts: { new: 0, planned: 0, done: 0, wont_fix: 0 },
  rows: [],
};
