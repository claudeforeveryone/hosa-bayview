import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { MovedFeedback } from "@/lib/feedback-moves";
import type { FeedbackRow } from "@/lib/owner-types";

// The feedback queue as the owner first sees it, and with notes where items moved out of the filter. The note's
// placement and when a save leaves one are pinned in src/lib/feedback-moves.test.ts.

vi.mock("@/app/(app)/developer/actions", () => ({
  triageFeedback: async () => ({ ok: true }),
}));

const { FeedbackList } = await import("./feedback-list");

const ROW: FeedbackRow = {
  id: "c0000001-0000-4000-8000-00000000c001",
  category: "bug",
  body: "Sample feedback: the timer kept running.",
  build: "a1b2c3d4e5f6",
  status: "new",
  priority: "normal",
  resolution: "",
  created_at: "2026-10-11T13:05:00Z",
  updated_at: "2026-10-11T13:05:00Z",
  triaged_at: null,
  sent_by: "Sample Trainee A",
};
const HREFS = {
  new: "/developer?tab=feedback&status=new",
  planned: "/developer?tab=feedback&status=planned",
  done: "/developer?tab=feedback&status=done",
  wont_fix: "/developer?tab=feedback&status=wont_fix",
};
const MOVED: MovedFeedback = {
  id: "c0000002-0000-4000-8000-00000000c002",
  after: ROW.id,
  index: 1,
  status: "wont_fix",
  category: "idea",
  sent_by: "Sample Trainee B",
};

const render = (rows: FeedbackRow[], moved: MovedFeedback[] = []) =>
  renderToStaticMarkup(
    createElement(FeedbackList, {
      rows,
      filter: "open",
      hrefs: HREFS,
      empty: "Nothing waiting. New feedback shows up here.",
      initialMoved: moved,
    }),
  );
const text = (markup: string) =>
  markup
    .replace(/<[^>]+>/g, " ")
    .replace(/&#x27;/g, "'")
    .replace(/\s+/g, " ")
    .trim();

describe("FeedbackList", () => {
  // send_feedback is callable by any member with their own session (0231), so the build is a claim, not proof.
  it("labels the build as sent, short, with no link", () => {
    const out = render([ROW]);
    expect(text(out)).toContain("build a1b2c3d (as sent)");
    expect(out).not.toContain("a1b2c3d4e5f6");
    expect(out).not.toContain("github.com");
  });

  it("keeps a note with a link to its new filter where a moved item was", () => {
    const out = render([ROW], [MOVED]);
    const words = text(out);
    expect(words).toContain(
      "Idea from Sample Trainee B moved to Won't fix. Show Won't fix",
    );
    expect(out).toContain(`href="${HREFS.wont_fix.replace(/&/g, "&amp;")}"`);
    expect(words.indexOf("timer kept running")).toBeLessThan(
      words.indexOf("moved to Won't fix"),
    );
    expect(out).toContain('tabindex="-1"');
  });

  it("shows the empty note only when there is nothing left, not even a moved item", () => {
    expect(text(render([]))).toBe(
      "Nothing waiting. New feedback shows up here.",
    );
    const out = text(render([], [{ ...MOVED, after: null, index: 0 }]));
    expect(out).toContain("moved to Won't fix");
    expect(out).not.toContain("Nothing waiting");
  });
});
