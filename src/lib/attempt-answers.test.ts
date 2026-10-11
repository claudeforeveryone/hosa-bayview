import { describe, expect, it } from "vitest";
import { SAVE_FAILED } from "./answer-saves";
import {
  showAnswer,
  settleAnswer,
  submitBlock,
  type Answer,
} from "./attempt-answers";

const saved = (selected: number, extra: Partial<Answer> = {}): Answer => ({
  selected,
  is_correct: null,
  correct_index: null,
  explanation: null,
  saved: true,
  ...extra,
});

describe("settleAnswer", () => {
  const opts = { practice: true, onScreen: "q1" };

  it("puts back the last answer the server confirmed when the newest pick fails", () => {
    const out = settleAnswer(
      { q1: saved(0) },
      { qid: "q1", sent: 2, reply: { error: SAVE_FAILED }, latest: true },
      opts,
    );
    expect(out.show).toEqual(saved(0));
    expect(out.error).toBe(SAVE_FAILED);
    expect(out.confirmed).toEqual({ q1: saved(0) });
    expect(out.verdict).toBeUndefined();
  });

  it("clears the question when a failed pick had nothing saved before it", () => {
    const out = settleAnswer(
      {},
      { qid: "q1", sent: 1, reply: { error: "Time is up." }, latest: true },
      opts,
    );
    expect(out.show).toBeNull();
    expect(out.error).toBe("Time is up.");
  });

  it("ignores an older pick's failure once a newer pick is on its way", () => {
    const out = settleAnswer(
      { q1: saved(0) },
      { qid: "q1", sent: 1, reply: { error: SAVE_FAILED }, latest: false },
      opts,
    );
    expect(out).toEqual({ confirmed: { q1: saved(0) } });
  });

  it("records an older pick's success without putting it on screen", () => {
    const out = settleAnswer(
      {},
      {
        qid: "q1",
        sent: 1,
        reply: { selected_index: 1, is_correct: false },
        latest: false,
      },
      opts,
    );
    expect(out.confirmed).toEqual({ q1: saved(1, { is_correct: false }) });
    expect(out.show).toBeUndefined();
    expect(out.verdict).toBeUndefined();
  });

  it("shows the server's stored pick and gives the verdict for the question on screen", () => {
    const out = settleAnswer(
      {},
      {
        qid: "q1",
        sent: 2,
        // A locked practice answer from another tab: the server keeps the first pick.
        reply: {
          selected_index: 0,
          is_correct: true,
          correct_index: 0,
          explanation: "Because.",
        },
        latest: true,
      },
      opts,
    );
    const got = saved(0, {
      is_correct: true,
      correct_index: 0,
      explanation: "Because.",
    });
    expect(out.show).toEqual(got);
    expect(out.confirmed).toEqual({ q1: got });
    expect(out.verdict).toBe(true);
    expect(out.error).toBeUndefined();
  });

  it("stores a verdict quietly when the taker has moved to another question", () => {
    const out = settleAnswer(
      {},
      {
        qid: "q1",
        sent: 1,
        reply: { selected_index: 1, is_correct: false },
        latest: true,
      },
      { practice: true, onScreen: "q2" },
    );
    expect(out.show).toEqual(saved(1, { is_correct: false }));
    expect(out.verdict).toBeUndefined();
  });

  it("gives no verdict in a timed run", () => {
    const out = settleAnswer(
      {},
      {
        qid: "q1",
        sent: 1,
        reply: { selected_index: 1, is_correct: null },
        latest: true,
      },
      { practice: false, onScreen: "q1" },
    );
    expect(out.verdict).toBeUndefined();
  });
});

describe("showAnswer", () => {
  it("sets, replaces and clears one question without touching the others", () => {
    const start = { q1: saved(0), q2: saved(1) };
    expect(showAnswer(start, "q1", saved(3))).toEqual({
      q1: saved(3),
      q2: saved(1),
    });
    expect(showAnswer(start, "q1", null)).toEqual({ q2: saved(1) });
    expect(start).toEqual({ q1: saved(0), q2: saved(1) });
  });
});

describe("submitBlock", () => {
  const rows = [
    { question_id: "a" },
    { question_id: "b" },
    { question_id: "c" },
  ];
  const base = {
    unsaved: ["c"],
    byTap: true,
    deadlinePassed: false,
    warned: null,
    rows,
    practice: false,
  };

  it("stops a tapped submit when a pick never reached the server, naming the question", () => {
    expect(submitBlock(base)).toEqual({
      key: "c",
      message:
        "Question 3 didn't save. Pick it again, or tap Submit again to hand in what's saved.",
    });
  });

  it("names every question that didn't save, in paper order, and says Finish in practice", () => {
    expect(
      submitBlock({ ...base, unsaved: ["c", "a"], practice: true })?.message,
    ).toBe(
      "Questions 1 and 3 didn't save. Pick them again, or tap Finish again to hand in what's saved.",
    );
  });

  it("lets the second tap through, so a pick that keeps failing can't trap the taker", () => {
    expect(submitBlock({ ...base, warned: "c" })).toBeNull();
  });

  it("warns again when a different question is the one that didn't save", () => {
    expect(submitBlock({ ...base, unsaved: ["a"], warned: "c" })?.key).toBe(
      "a",
    );
  });

  it("never stops a submit once the deadline has passed", () => {
    expect(submitBlock({ ...base, deadlinePassed: true })).toBeNull();
  });

  it("never stops the timer's own submit", () => {
    expect(submitBlock({ ...base, byTap: false })).toBeNull();
  });

  it("lets everything through when every pick saved", () => {
    expect(submitBlock({ ...base, unsaved: [] })).toBeNull();
  });
});
