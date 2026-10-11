import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { FlagState } from "@/lib/flag-thread";

// Ask teacher under a reviewed question, as the member first sees it for each state of their thread. The rules
// themselves are pinned in src/lib/flag-thread.test.ts; this checks the component shows what they say, plus the
// status line and the earlier reply on a reopened thread.

vi.mock("@/app/(app)/c/[id]/tests/actions", () => ({
  askTeacher: async () => ({}),
  reportQuestion: async () => ({}),
}));

const { AskTeacher } = await import("./ask-teacher");

const ID = "00000000-0000-4000-8000-00000000a001";
const thread = (
  status: FlagState["status"],
  reason: FlagState["reason"],
  reply = "",
  note = "Sample note",
): FlagState => ({ id: ID, note, status, reply, reason });

const render = (flag: FlagState | null, canReport: boolean) =>
  renderToStaticMarkup(
    createElement(AskTeacher, {
      testId: "00000000-0000-4000-8000-00000000d001",
      questionId: "00000000-0000-4000-8000-00000000e001",
      flag,
      canReport,
    }),
  );
const buttons = (markup: string) =>
  [...markup.matchAll(/<button[^>]*>([^<]*)<\/button>/g)].map((m) => m[1]);
const text = (markup: string) =>
  markup
    .replace(/<[^>]+>/g, " ")
    .replace(/&#x27;/g, "'")
    .replace(/\s+/g, " ")
    .trim();

describe("AskTeacher", () => {
  it("offers both on a question with no thread, and only Ask before reports are on", () => {
    expect(buttons(render(null, true))).toEqual([
      "Ask teacher",
      "Report this question",
    ]);
    expect(buttons(render(null, false))).toEqual(["Ask teacher"]);
  });

  it("shows an open question and lets the member ask again or report", () => {
    const markup = render(thread("open", "ask"), true);
    expect(text(markup)).toContain("Asked. Waiting for a reply. Sample note");
    expect(buttons(markup)).toEqual(["Ask again", "Report this question"]);
  });

  it("has no Ask while a report is open, even when the probe said reports are off", () => {
    for (const canReport of [true, false]) {
      const markup = render(thread("open", "typo"), canReport);
      expect(text(markup)).toContain("Reported: Typo. Waiting for a reply.");
      expect(buttons(markup)).toEqual(["Change report"]);
    }
  });

  it("closes Ask after a reply, but a report can reopen the thread", () => {
    const markup = render(thread("answered", "ask", "C is -otomy."), true);
    expect(text(markup)).toContain("Teacher replied C is -otomy.");
    expect(buttons(markup)).toEqual(["Report this question"]);
    expect(buttons(render(thread("answered", "ask", "R"), false))).toEqual([]);
  });

  it("offers Report again on an answered report", () => {
    const markup = render(thread("answered", "wrong_answer", "Fixed."), false);
    expect(text(markup)).toContain(
      "Reported: Wrong answer key. Teacher replied Fixed.",
    );
    expect(buttons(markup)).toEqual(["Report again"]);
  });

  it("keeps the trainer's reply on a reopened thread, as the earlier reply", () => {
    const markup = render(
      thread("open", "wrong_answer", "Tachy- is fast.", "The key says slow"),
      true,
    );
    expect(text(markup)).toContain(
      "Reported: Wrong answer key. Waiting for a reply. The key says slow Earlier reply Tachy- is fast.",
    );
    expect(buttons(markup)).toEqual(["Change report"]);
  });
});
