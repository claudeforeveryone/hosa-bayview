import { describe, expect, it } from "vitest";
import { afterSend, threadButtons, type FlagState } from "./flag-thread";

// One member's Ask teacher thread on one question, as migration 0231 runs it: a report is an ask with a reason; an
// ask on an open report keeps the report; a report can reopen an answered thread and the trainer's reply stays;
// asking again after a reply stays closed. The UI copies these rules, so they are pinned here.

const ID = "00000000-0000-4000-8000-00000000a001";
const thread = (
  status: FlagState["status"],
  reason: FlagState["reason"],
  reply = "",
  note = "Sample note",
): FlagState => ({ id: ID, note, status, reply, reason });

describe("threadButtons", () => {
  const cases: [
    string,
    FlagState | null,
    boolean,
    ReturnType<typeof threadButtons>,
  ][] = [
    [
      "nothing sent yet",
      null,
      true,
      { ask: "Ask teacher", report: "Report this question" },
    ],
    [
      "nothing sent, reports not on the database",
      null,
      false,
      { ask: "Ask teacher", report: null },
    ],
    [
      "an open question",
      thread("open", "ask"),
      true,
      { ask: "Ask again", report: "Report this question" },
    ],
    [
      "an open question, reports off",
      thread("open", "ask"),
      false,
      { ask: "Ask again", report: null },
    ],
    // No Ask while a report is open: Change report holds the note, so words never turn it back into a question.
    [
      "an open report",
      thread("open", "typo"),
      true,
      { ask: null, report: "Change report" },
    ],
    // A report on the thread proves reports are on, whatever the probe said.
    [
      "an open report, probe said off",
      thread("open", "typo"),
      false,
      { ask: null, report: "Change report" },
    ],
    [
      "an answered question",
      thread("answered", "ask", "R"),
      true,
      { ask: null, report: "Report this question" },
    ],
    [
      "an answered question, reports off",
      thread("answered", "ask", "R"),
      false,
      { ask: null, report: null },
    ],
    [
      "an answered report",
      thread("answered", "wrong_answer", "R"),
      true,
      { ask: null, report: "Report again" },
    ],
    [
      "an answered report, probe said off",
      thread("answered", "wrong_answer", "R"),
      false,
      { ask: null, report: "Report again" },
    ],
  ];
  for (const [name, current, canReport, expected] of cases)
    it(name, () => expect(threadButtons(current, canReport)).toEqual(expected));
});

describe("afterSend", () => {
  it("starts a question thread", () => {
    expect(
      afterSend(null, {
        id: ID,
        mode: "ask",
        reason: null,
        note: "  Why C?  ",
      }),
    ).toEqual({
      id: ID,
      note: "Why C?",
      status: "open",
      reply: "",
      reason: "ask",
    });
  });

  it("keeps an open report's reason when the member adds words through Ask (0231)", () => {
    expect(
      afterSend(thread("open", "typo"), {
        id: ID,
        mode: "ask",
        reason: null,
        note: "Still wrong",
      }),
    ).toEqual({
      id: ID,
      note: "Still wrong",
      status: "open",
      reply: "",
      reason: "typo",
    });
  });

  it("turns an open question into a report", () => {
    expect(
      afterSend(thread("open", "ask"), {
        id: ID,
        mode: "report",
        reason: "unclear",
        note: "",
      }).reason,
    ).toBe("unclear");
  });

  it("reopens an answered thread with a report and keeps the trainer's reply (0231)", () => {
    expect(
      afterSend(thread("answered", "ask", "C is -otomy"), {
        id: ID,
        mode: "report",
        reason: "wrong_answer",
        note: "The key says B",
      }),
    ).toEqual({
      id: ID,
      note: "The key says B",
      status: "open",
      reply: "C is -otomy",
      reason: "wrong_answer",
    });
  });

  it("changes an open report's reason", () => {
    expect(
      afterSend(thread("open", "typo"), {
        id: ID,
        mode: "report",
        reason: "other",
        note: "",
      }).reason,
    ).toBe("other");
  });
});
