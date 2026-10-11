import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { AuditRow, FeedbackQueue, FeedbackRow } from "@/lib/owner-types";

// The feedback queue and the audit log as the owner sees them: "Older" leads to a page with rows, never to an empty
// one. A filter or a search with exactly 50 (or 100) items used to offer it anyway.

vi.mock("@/app/(app)/developer/actions", () => ({
  triageFeedback: async () => ({}),
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: () => {} }),
  usePathname: () => "/developer",
}));

const { FeedbackSection } = await import("./feedback");
const { AuditSection } = await import("./audit");

const feedback = (i: number): FeedbackRow => ({
  id: `00000000-0000-4000-8000-${String(i).padStart(12, "0")}`,
  category: "idea",
  body: `Sample idea ${i}`,
  build: null,
  status: "new",
  priority: "normal",
  resolution: "",
  created_at: "2026-10-11T12:00:00Z",
  updated_at: "2026-10-11T12:00:00Z",
  triaged_at: null,
  sent_by: "Sample Member",
});
const queue = (shown: number, newCount: number): FeedbackQueue => ({
  counts: { new: newCount, planned: 0, done: 0, wont_fix: 0 },
  rows: Array.from({ length: shown }, (_, i) => feedback(i + 1)),
});
const audit = (i: number): AuditRow => ({
  id: i,
  created_at: "2026-10-11T12:00:00Z",
  actor_name: "Sample Exec",
  action: "warned",
  target_name: "Sample Member",
  detail: "Sample warning",
});

const older = (markup: string) => />Older</.test(markup);
const newer = (markup: string) => />Newer</.test(markup);

describe("the feedback queue's pager", () => {
  const render = (page: number, shown: number, total: number) =>
    renderToStaticMarkup(
      createElement(FeedbackSection, {
        base: "/developer",
        filter: "open",
        page,
        queue: queue(shown, total),
        readOnly: true,
      }),
    );

  it("has no Older link when the filter holds exactly one page", () => {
    expect(older(render(0, 50, 50))).toBe(false);
  });

  it("has one when there are more", () => {
    expect(older(render(0, 50, 51))).toBe(true);
  });

  it("stops on the last full page", () => {
    const markup = render(1, 50, 100);
    expect(older(markup)).toBe(false);
    expect(newer(markup)).toBe(true);
  });
});

describe("the audit log's pager", () => {
  const render = (hasMore: boolean) =>
    renderToStaticMarkup(
      createElement(AuditSection, {
        base: "/developer",
        q: "warned",
        page: 0,
        rows: Array.from({ length: 50 }, (_, i) => audit(i + 1)),
        hasMore,
      }),
    );

  it("follows whether an older page has rows, not how many rows this page has", () => {
    expect(older(render(false))).toBe(false);
    expect(older(render(true))).toBe(true);
  });
});
