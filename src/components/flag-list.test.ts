import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import {
  classroomFlagsFixture,
  trainerTestFixture,
} from "@/lib/owner-fixtures";

// Where a trainer answers Ask teacher questions and question reports (0231): the test page's section and the
// classroom hub's folded panel. Both say reports come here, and each report is tagged with its reason.

vi.mock("@/app/(app)/c/[id]/tests/actions", () => ({
  replyToFlag: async () => ({}),
}));

const { ClassroomFlagsPanel, TestFlagsSection } = await import("./flag-list");

const text = (markup: string) =>
  markup
    .replace(/<[^>]+>/g, " ")
    .replace(/&#x27;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
const section = (flags = trainerTestFixture.flags, readOnly = false) =>
  renderToStaticMarkup(
    createElement(TestFlagsSection, {
      testId: trainerTestFixture.testId,
      flags,
      readOnly,
    }),
  );
const panel = (flags = classroomFlagsFixture) =>
  renderToStaticMarkup(
    createElement(ClassroomFlagsPanel, {
      classroomId: trainerTestFixture.classroomId,
      flags,
      open: true,
    }),
  );

describe("the trainer's list of questions and reports", () => {
  it("says reports land here, on the test page and the classroom hub", () => {
    expect(text(section())).toMatch(/^Ask teacher and reports 6 /);
    expect(text(panel())).toMatch(/^Ask teacher and reports 6 open /);
  });

  it("tags each report with its reason and leaves a plain question untagged", () => {
    const out = text(section());
    for (const tag of [
      "Reported: Wrong answer key",
      "Reported: Unclear wording",
      "Reported: Typo",
      "Reported: Something else",
    ])
      expect(out, tag).toContain(tag);
    expect(out.split("Reported:").length - 1).toBe(5);
    expect(out).toContain("why nephr- and not ren-?");
  });

  it("names each row's test on the classroom hub", () => {
    const out = text(panel());
    expect(out.split("Sample Practice Set 3").length - 1).toBe(6);
  });

  it("says what to expect when nothing is open", () => {
    expect(text(section([]))).toContain("No open questions or reports.");
    expect(text(panel([]))).toContain(
      "No open questions or reports. When a member taps Ask teacher or reports a question, it shows up here and in your notifications.",
    );
  });

  it("switches the reply off in the read-only gallery", () => {
    const out = section(trainerTestFixture.flags, true);
    expect(out.match(/<textarea[^>]*disabled/g)?.length).toBe(6);
    expect(out.match(/<button[^>]*disabled/g)?.length).toBe(6);
    expect(section().match(/<textarea[^>]*disabled/g)).toBeNull();
  });
});
