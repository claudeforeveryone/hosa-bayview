import { describe, expect, it } from "vitest";
import { SAVE_FAILED } from "./answer-saves";
import {
  pickErrorText,
  showAnswer,
  settleAnswer,
  submitBlock,
  submitProblemText,
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
  };

  it("stops a tapped submit when a pick never reached the server, naming the question", () => {
    expect(submitBlock(base)).toEqual({ key: "c", numbers: [3] });
  });

  it("names every question that didn't save, in paper order", () => {
    expect(submitBlock({ ...base, unsaved: ["c", "a"] })).toEqual({
      key: "a,c",
      numbers: [1, 3],
    });
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

  // Q3's pick failed and went back to blank; the taker then tapped "Submit now" on "1 question still blank".
  it("lets a lost pick through when the taker just confirmed handing it in blank", () => {
    expect(submitBlock({ ...base, confirmedBlank: ["c"] })).toBeNull();
  });

  it("still names a lost pick the screen showed as answered when the taker confirmed the blanks", () => {
    // Q1 showed an older saved answer (or a pick still on its way) and wasn't in the "still blank" count.
    expect(
      submitBlock({ ...base, unsaved: ["a", "c"], confirmedBlank: ["c"] }),
    ).toEqual({ key: "a", numbers: [1] });
  });
});

// The text is built when it shows, from the button on screen then: Finish, Submit, or Submit now once the
// "still blank" step is open (a lost practice pick always leaves its question blank, so that is the usual one).
describe("submitProblemText", () => {
  it("names the question and the button the taker can see", () => {
    expect(
      submitProblemText({ kind: "unsaved", numbers: [1] }, "Submit now"),
    ).toBe(
      "Question 1 didn't save. Pick it again, or tap Submit now to hand in what's saved.",
    );
  });

  it("lists several questions", () => {
    expect(
      submitProblemText({ kind: "unsaved", numbers: [1, 2, 5] }, "Submit"),
    ).toBe(
      "Questions 1, 2 and 5 didn't save. Pick them again, or tap Submit to hand in what's saved.",
    );
  });

  it("asks for another tap of the same button when the submit couldn't reach the server", () => {
    expect(submitProblemText({ kind: "offline" }, "Finish")).toBe(
      "That didn't go through. Check your connection, then tap Finish.",
    );
  });

  it("passes the server's own reason through", () => {
    expect(
      submitProblemText(
        { kind: "refused", message: "That attempt doesn't exist." },
        "Submit",
      ),
    ).toBe("That attempt doesn't exist.");
  });
});

// A save fails for the question it was sent for, which may not be the one on screen by the time it settles.
describe("pickErrorText", () => {
  const rows = [
    { question_id: "a" },
    { question_id: "b" },
    { question_id: "c" },
  ];

  it("keeps the plain text on the question it is about", () => {
    expect(pickErrorText({ qid: "b", message: SAVE_FAILED }, "b", rows)).toBe(
      SAVE_FAILED,
    );
  });

  it("names a question the taker has moved past, and says to go back to it", () => {
    expect(pickErrorText({ qid: "b", message: SAVE_FAILED }, "c", rows)).toBe(
      "Question 2's answer didn't save. Go back and pick it again.",
    );
  });

  it("puts the question number on a refusal for another question", () => {
    expect(pickErrorText({ qid: "a", message: "Time is up." }, "c", rows)).toBe(
      "Question 1: Time is up.",
    );
  });
});
