import { describe, expect, it } from "vitest";
import { FEEDBACK_FILTERS, STATUS_LABEL } from "./owner-metrics";
import {
  auditFixture,
  contentFixture,
  engagementFixture,
  feedbackFixtureFor,
  growth7Fixture,
  growth90Fixture,
  growthAllFixture,
  growthFixture,
  overviewFixture,
  smallEngagementFixture,
  smallFeedbackFixture,
  smallGrowth7Fixture,
  smallGrowth90Fixture,
  smallGrowthAllFixture,
  smallGrowthFixture,
  smallOverviewFixture,
} from "./owner-fixtures";
import type { EngagementData, GrowthData, OwnerOverview } from "./owner-types";

// The dev gallery is where the console's design gets reviewed, so its made-up data has to be data the owner_*
// functions (0232) could return. Numbers that disagree with each other on one screen get reviewed as if they were
// real, and states the database can't produce hide the ones it can.

describe("the gallery's feedback queue", () => {
  it("lists exactly as many rows as each filter's count says, all with that filter's status", () => {
    for (const filter of FEEDBACK_FILTERS) {
      const { counts, rows } = feedbackFixtureFor(filter, false);
      const expected =
        filter === "open"
          ? counts.new + counts.planned
          : filter === "all"
            ? counts.new + counts.planned + counts.done + counts.wont_fix
            : counts[filter];
      expect(rows.length, filter).toBe(expected);
      for (const row of rows) {
        if (filter === "open")
          expect(["new", "planned"], row.id).toContain(row.status);
        else if (filter !== "all") expect(row.status, row.id).toBe(filter);
      }
    }
  });

  it("has every status, and a resolution note on the closed ones", () => {
    const { rows } = feedbackFixtureFor("all", false);
    for (const status of ["new", "planned", "done", "wont_fix"])
      expect(
        rows.some((r) => r.status === status),
        status,
      ).toBe(true);
    for (const r of rows.filter(
      (r) => r.status === "done" || r.status === "wont_fix",
    )) {
      expect(r.resolution, r.id).not.toBe("");
      expect(r.triaged_at, r.id).not.toBeNull();
    }
  });

  // The column defaults to 'normal' and owner_triage_feedback stamps triaged_at on every change (0231, 0232), so
  // anything other than an untouched new item has been triaged.
  it("has a triage time on every row that has been triaged", () => {
    for (const r of feedbackFixtureFor("all", false).rows) {
      const touched =
        r.priority !== "normal" || r.status !== "new" || r.resolution !== "";
      if (touched) expect(r.triaged_at, r.id).not.toBeNull();
    }
  });

  it("has an empty small-chapter queue for the nothing-here states", () => {
    expect(feedbackFixtureFor("done", true)).toEqual(smallFeedbackFixture);
    expect(smallFeedbackFixture.rows).toEqual([]);
  });
});

describe("the gallery's content health", () => {
  it("adds the rooms' open reports up to the total", () => {
    const sum = contentFixture.per_event.reduce(
      (n, e) => n + e.open_reports,
      0,
    );
    expect(sum).toBe(contentFixture.open_reports);
  });

  // owner_content builds per_event from every classroom and every test has one, so the rooms add up to the totals.
  it("adds the rooms' questions, tests and missing explanations up to the totals", () => {
    const sum = (k: "questions" | "tests" | "missing_explanations") =>
      contentFixture.per_event.reduce((n, e) => n + e[k], 0);
    expect(sum("questions")).toBe(contentFixture.questions);
    expect(sum("tests")).toBe(contentFixture.tests);
    expect(sum("missing_explanations")).toBe(
      contentFixture.missing_explanations,
    );
    expect(contentFixture.published_tests).toBeLessThanOrEqual(
      contentFixture.tests,
    );
    for (const e of contentFixture.per_event) {
      expect(e.missing_explanations, e.name).toBeLessThanOrEqual(e.questions);
      expect(e.repeated, e.name).toBeLessThan(Math.max(1, e.questions));
    }
  });

  it("orders the rooms the way owner_content does: most questions first, then by name", () => {
    const order = [...contentFixture.per_event].sort(
      (a, b) => b.questions - a.questions || a.name.localeCompare(b.name),
    );
    expect(contentFixture.per_event.map((e) => e.id)).toEqual(
      order.map((e) => e.id),
    );
  });

  // owner_content lists the top 20 groups by copies and counts all of them.
  it("lists as many repeated questions as it counts, up to 20, most copies first", () => {
    const { duplicates, duplicate_groups } = contentFixture;
    expect(duplicates.length).toBe(Math.min(duplicate_groups, 20));
    for (let i = 1; i < duplicates.length; i++)
      expect(duplicates[i - 1].copies).toBeGreaterThanOrEqual(
        duplicates[i].copies,
      );
    for (const d of duplicates) {
      expect(d.copies, d.example ?? "").toBeGreaterThan(1);
      expect(d.tests, d.example ?? "").toBeLessThanOrEqual(d.copies);
      expect(d.rooms.length, d.example ?? "").toBeLessThanOrEqual(d.tests);
    }
  });

  // A room's "repeated" is its extra copies of a stem it already has. With every repeated stem listed, each one
  // adds between copies - rooms (copies spread as evenly as possible) and copies - 1 (all in one room), a room
  // can only have extras if a listed stem is in it, and a stem kept to one room puts all its extras there.
  it("gives the rooms the extra copies the listed repeated questions account for", () => {
    const { duplicates, duplicate_groups, per_event } = contentFixture;
    expect(duplicate_groups).toBeLessThanOrEqual(20);
    const repeated = per_event.reduce((n, e) => n + e.repeated, 0);
    const least = duplicates.reduce(
      (n, d) => n + d.copies - d.rooms.length,
      0,
    );
    const most = duplicates.reduce((n, d) => n + d.copies - 1, 0);
    expect(repeated).toBeGreaterThanOrEqual(least);
    expect(repeated).toBeLessThanOrEqual(most);
    for (const e of per_event.filter((e) => e.repeated > 0))
      expect(
        duplicates.some((d) => d.rooms.includes(e.name)),
        e.name,
      ).toBe(true);
    for (const d of duplicates.filter((d) => d.rooms.length === 1)) {
      const room = per_event.find((e) => e.name === d.rooms[0]);
      expect(room?.repeated ?? 0, d.rooms[0]).toBeGreaterThanOrEqual(
        d.copies - 1,
      );
    }
  });

  // owner_content counts both from the same open report flags, and lists up to 25 questions, so with this few
  // every reported question is listed and each room's count matches its listed questions.
  it("gives each room the same open reports as its listed questions", () => {
    for (const room of contentFixture.per_event) {
      const listed = contentFixture.reported
        .filter((r) => r.classroom_id === room.id)
        .reduce((n, r) => n + r.reports, 0);
      expect(listed, room.name).toBe(room.open_reports);
    }
  });
});

// The audit log as the database writes it: triage in the console's words (0232's private.triage_label).
describe("the gallery's audit log", () => {
  it("never shows a raw status code in a triage line", () => {
    for (const r of auditFixture.filter((r) => r.action === "feedback")) {
      expect(r.detail, String(r.id)).not.toMatch(/\b(new|planned|done|wont_fix)\b/);
      expect(r.detail, String(r.id)).toMatch(
        new RegExp(`^(status|priority|note)`),
      );
    }
    expect(
      auditFixture.some((r) => r.detail.includes(STATUS_LABEL.wont_fix)),
    ).toBe(true);
  });
});

// Overview, Growth and Engagement for one chapter, as one database would answer them on one day. A hidden count
// (null) is 1 to 4, so a comparison holds when some value in that range makes it true. TODAY in the fixtures is a
// Sunday, so the last Monday-to-Sunday week is exactly the last 7 days.
type Chapter = {
  name: string;
  overview: OwnerOverview;
  g7: GrowthData;
  g30: GrowthData;
  g90: GrowthData;
  gAll: GrowthData;
  engagement: EngagementData;
};
const chapters: Chapter[] = [
  {
    name: "the full chapter",
    overview: overviewFixture,
    g7: growth7Fixture,
    g30: growthFixture,
    g90: growth90Fixture,
    gAll: growthAllFixture,
    engagement: engagementFixture,
  },
  {
    name: "the small chapter (?scale=small)",
    overview: smallOverviewFixture,
    g7: smallGrowth7Fixture,
    g30: smallGrowthFixture,
    g90: smallGrowth90Fixture,
    gAll: smallGrowthAllFixture,
    engagement: smallEngagementFixture,
  },
];
const lo = (n: number | null) => n ?? 1;
const hi = (n: number | null) => n ?? 4;
// a <= b can hold.
const atMost = (a: number | null, b: number | null) => lo(a) <= hi(b);

describe.each(chapters)("$name", (c) => {
  const ranges = [c.g7, c.g30, c.g90, c.gAll];

  it("tells the same story on Overview and Growth", () => {
    expect(c.g7.new_total).toBe(c.overview.new_7d);
    expect(c.g7.active_total).toBe(c.overview.wau);
    expect(c.g30.new_total).toBe(c.overview.new_30d);
    expect(c.g30.active_total).toBe(c.overview.mau);
    expect(c.g30.buckets.at(-1)?.active).toBe(c.overview.dau);
    expect(c.g7.buckets).toEqual(c.g30.buckets.slice(-7));
    // All time starts on the first sign-up, so everyone is new in it.
    expect(c.gAll.new_total).toBe(c.overview.members);
  });

  it("never shrinks a total as the range grows, or passes the member count", () => {
    for (const key of ["new_total", "active_total"] as const) {
      const totals = ranges.map((g) => g[key]);
      for (let i = 1; i < totals.length; i++)
        expect(atMost(totals[i - 1], totals[i]), `${key} ${i}`).toBe(true);
      for (const t of totals)
        expect(atMost(t, c.overview.members), key).toBe(true);
    }
    expect(atMost(c.overview.dau, c.overview.wau)).toBe(true);
    expect(atMost(c.overview.wau, c.overview.mau)).toBe(true);
    expect(atMost(c.overview.new_7d, c.overview.new_30d)).toBe(true);
  });

  // Signing up opens the site, and the heartbeat writes that day to sign_in_days (0081).
  it("counts everyone who joined in a range as active in it", () => {
    for (const g of ranges) {
      expect(atMost(g.new_total, g.active_total), g.from).toBe(true);
      for (const b of g.buckets)
        if (b.new !== null)
          expect(atMost(b.new, b.active), b.start).toBe(true);
    }
  });

  it("has no day or week busier than its range", () => {
    for (const g of ranges)
      for (const b of g.buckets)
        expect(atMost(b.active, g.active_total), b.start).toBe(true);
  });

  it("makes the last week the last 7 days, and the week before it the 7 days before", () => {
    for (const g of [c.g90, c.gAll]) {
      const last = g.buckets.at(-1)!;
      expect(last.start).toBe(c.g7.from);
      expect(last.active).toBe(c.overview.wau);
      expect(g.buckets.at(-2)!.active).toBe(c.overview.wau_prev);
    }
  });

  it("makes a week at least as busy as its busiest day", () => {
    for (const g of [c.g90, c.gAll])
      for (const w of g.buckets)
        for (const d of c.g30.buckets.filter(
          (d) => d.start >= w.start && d.end <= w.end,
        ))
          expect(atMost(d.active, w.active), `${d.start} in ${w.start}`).toBe(
            true,
          );
  });

  it("gives a week the same figure in the 90-day and all-time views", () => {
    for (const w of c.g90.buckets) {
      const same = c.gAll.buckets.find(
        (x) => x.start === w.start && x.end === w.end,
      );
      if (same) expect(same.active, w.start).toBe(w.active);
    }
  });

  it("adds weekly new members up to the range, and to the 7 and 30 day figures", () => {
    if (!c.g90.new_by_bucket) return;
    const sum = (bs: GrowthData["buckets"]) =>
      bs.reduce((n, b) => n + (b.new ?? 0), 0);
    expect(sum(c.g90.buckets)).toBe(c.g90.new_total);
    expect(c.g90.buckets.at(-1)!.new).toBe(c.overview.new_7d);
    const inside = c.g90.buckets.filter((b) => b.start >= c.g30.from);
    const touching = c.g90.buckets.filter((b) => b.end >= c.g30.from);
    expect(sum(inside)).toBeLessThanOrEqual(c.overview.new_30d ?? 4);
    expect(sum(touching)).toBeGreaterThanOrEqual(c.overview.new_30d ?? 1);
  });

  // Engagement's default range is the same 30 days, and everyone behind a count opened the site.
  it("has no more people behind an Engagement row than were active this month", () => {
    expect(c.engagement.from).toBe(c.g30.from);
    for (const f of c.engagement.features)
      expect(atMost(f.people, c.overview.mau), f.id).toBe(true);
    const created = c.engagement.features.find(
      (f) => f.id === "account_created",
    )!;
    expect(created.count).toBe(c.overview.new_30d);
  });
});
