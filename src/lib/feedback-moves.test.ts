import { describe, expect, it } from "vitest";
import {
  noteAfterSave,
  placeMoved,
  type MovedFeedback,
} from "./feedback-moves";
import { inFeedbackFilter } from "./owner-metrics";

// Triage that moves an item out of the filter on screen (Done under Open, say) drops it from the refreshed list.
// The console keeps a one-line note where it was until the owner leaves the page, so the place in the queue and
// the keyboard focus have somewhere to stay.

describe("inFeedbackFilter", () => {
  it("files each status the way owner_feedback filters (0232)", () => {
    expect(inFeedbackFilter("new", "open")).toBe(true);
    expect(inFeedbackFilter("planned", "open")).toBe(true);
    expect(inFeedbackFilter("done", "open")).toBe(false);
    expect(inFeedbackFilter("wont_fix", "open")).toBe(false);
    expect(inFeedbackFilter("done", "done")).toBe(true);
    expect(inFeedbackFilter("planned", "done")).toBe(false);
    expect(inFeedbackFilter("wont_fix", "wont_fix")).toBe(true);
    expect(inFeedbackFilter("new", "planned")).toBe(false);
    for (const s of ["new", "planned", "done", "wont_fix"] as const)
      expect(inFeedbackFilter(s, "all")).toBe(true);
  });
});

const row = (id: string) => ({ id });
const moved = (
  id: string,
  after: string | null,
  index: number,
): MovedFeedback => ({
  id,
  after,
  index,
  status: "done",
  category: "bug",
  sent_by: "Sample Member",
});
const ids = (entries: { kind: string; id: string }[]) =>
  entries.map((e) => (e.kind === "moved" ? `[${e.id}]` : e.id));

describe("placeMoved", () => {
  it("lists the server's rows as they are when nothing moved", () => {
    expect(ids(placeMoved([row("a"), row("b")], []))).toEqual(["a", "b"]);
  });

  it("puts a moved item's note where the row was", () => {
    const rows = [row("a"), row("c")];
    expect(ids(placeMoved(rows, [moved("b", "a", 1)]))).toEqual([
      "a",
      "[b]",
      "c",
    ]);
  });

  it("puts the first row's note first", () => {
    expect(ids(placeMoved([row("b")], [moved("a", null, 0)]))).toEqual([
      "[a]",
      "b",
    ]);
  });

  it("keeps notes in place as the owner works down the queue", () => {
    // a, b, c, d on screen; b then c set to Done, each one placed after what was above it at the time.
    const rows = [row("a"), row("d")];
    expect(
      ids(placeMoved(rows, [moved("b", "a", 1), moved("c", "b", 2)])),
    ).toEqual(["a", "[b]", "[c]", "d"]);
  });

  it("closes the queue to notes only when every row moved", () => {
    expect(
      ids(placeMoved([], [moved("a", null, 0), moved("b", "a", 1)])),
    ).toEqual(["[a]", "[b]"]);
  });

  it("shows the row, not a note, while the refreshed list still has it", () => {
    expect(ids(placeMoved([row("a"), row("b")], [moved("b", "a", 1)]))).toEqual(
      ["a", "b"],
    );
  });

  it("falls back to the old position when the row above it is gone too", () => {
    // x was above b, and has since left the list some other way (triaged in another tab).
    const rows = [row("a"), row("c"), row("d")];
    expect(ids(placeMoved(rows, [moved("b", "x", 1)]))).toEqual([
      "a",
      "[b]",
      "c",
      "d",
    ]);
    expect(ids(placeMoved([row("a")], [moved("b", "x", 5)]))).toEqual([
      "a",
      "[b]",
    ]);
  });
});

describe("noteAfterSave", () => {
  const item = (id: string) => ({
    id,
    category: "idea" as const,
    sent_by: "Sample Member",
  });
  const on = placeMoved([item("a"), item("b"), item("c")], []);

  it("leaves no note when the new status stays under the filter", () => {
    expect(noteAfterSave(on, item("b"), "planned", "open")).toBeNull();
    expect(noteAfterSave(on, item("b"), "done", "all")).toBeNull();
    expect(noteAfterSave(on, item("b"), "done", "done")).toBeNull();
  });

  it("notes an item that left the filter, under the entry that was above it", () => {
    expect(noteAfterSave(on, item("b"), "wont_fix", "open")).toEqual({
      id: "b",
      after: "a",
      index: 1,
      status: "wont_fix",
      category: "idea",
      sent_by: "Sample Member",
    });
    expect(noteAfterSave(on, item("a"), "new", "done")).toMatchObject({
      after: null,
      index: 0,
      status: "new",
    });
  });

  it("counts an earlier note as the entry above", () => {
    const later = placeMoved(
      [item("a"), item("c")],
      [noteAfterSave(on, item("b"), "done", "open")!],
    );
    expect(noteAfterSave(later, item("c"), "done", "open")).toMatchObject({
      after: "b",
      index: 2,
    });
  });
});
