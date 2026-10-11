import { describe, expect, it } from "vitest";
import { FEEDBACK_FILTERS } from "./owner-metrics";
import {
  contentFixture,
  feedbackFixtureFor,
  smallFeedbackFixture,
} from "./owner-fixtures";

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
