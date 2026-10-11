import { describe, expect, it } from "vitest";
import {
  answerAction,
  answerKeysLabel,
  isControlTarget,
  isTypingTarget,
  keysLine,
  pickIndex,
  type AnswerKeyContext,
  type KeyEventLike,
  type KeyTarget,
} from "./answer-keys";

const press = (
  key: string,
  extra: Partial<KeyEventLike> = {},
): KeyEventLike => ({
  key,
  ctrlKey: false,
  metaKey: false,
  altKey: false,
  shiftKey: false,
  repeat: false,
  ...extra,
});

const BODY: KeyTarget = {
  tagName: "BODY",
  isContentEditable: false,
  role: null,
};
const BUTTON: KeyTarget = {
  tagName: "BUTTON",
  isContentEditable: false,
  role: null,
};
const INPUT: KeyTarget = {
  tagName: "INPUT",
  isContentEditable: false,
  role: null,
};
const TEXTAREA: KeyTarget = {
  tagName: "TEXTAREA",
  isContentEditable: false,
  role: null,
};
const EDITABLE: KeyTarget = {
  tagName: "DIV",
  isContentEditable: true,
  role: null,
};
const HEADING: KeyTarget = {
  tagName: "H2",
  isContentEditable: false,
  role: null,
};
const ROLE_BUTTON: KeyTarget = {
  tagName: "DIV",
  isContentEditable: false,
  role: "button",
};

const ctx = (over: Partial<AnswerKeyContext> = {}): AnswerKeyContext => ({
  options: 4,
  prev: true,
  next: true,
  enter: true,
  space: true,
  dialogOpen: false,
  selecting: false,
  ...over,
});

describe("pickIndex", () => {
  it("maps 1-4 and A-D to the first four choices", () => {
    expect([1, 2, 3, 4].map((n) => pickIndex(String(n), 4))).toEqual([
      0, 1, 2, 3,
    ]);
    expect(["a", "b", "c", "d"].map((k) => pickIndex(k, 4))).toEqual([
      0, 1, 2, 3,
    ]);
  });

  it("takes capital letters too (Shift is allowed on a letter)", () => {
    expect(pickIndex("A", 4)).toBe(0);
    expect(pickIndex("D", 4)).toBe(3);
  });

  it("supports five choices with 5 and E", () => {
    expect(pickIndex("5", 5)).toBe(4);
    expect(pickIndex("e", 5)).toBe(4);
  });

  it("ignores a key past the choices on screen", () => {
    expect(pickIndex("3", 2)).toBeNull();
    expect(pickIndex("c", 2)).toBeNull();
    expect(pickIndex("5", 4)).toBeNull();
  });

  it("never picks more than five, and never with no options", () => {
    expect(pickIndex("6", 9)).toBeNull();
    expect(pickIndex("1", 0)).toBeNull();
    expect(pickIndex("1", -3)).toBeNull();
  });

  it("ignores other keys, multi-character names and the zero key", () => {
    expect(pickIndex("0", 4)).toBeNull();
    expect(pickIndex("f", 9)).toBeNull();
    expect(pickIndex("Enter", 4)).toBeNull();
    expect(pickIndex("", 4)).toBeNull();
  });
});

describe("answerAction picks", () => {
  it("picks on a digit or letter with no modifiers", () => {
    expect(answerAction(press("2"), BODY, ctx())).toEqual({
      kind: "pick",
      index: 1,
    });
    expect(answerAction(press("c"), HEADING, ctx())).toEqual({
      kind: "pick",
      index: 2,
    });
  });

  it("still picks while a button or heading has focus (a tabbing keyboard user keeps the shortcut)", () => {
    expect(answerAction(press("1"), BUTTON, ctx())).toEqual({
      kind: "pick",
      index: 0,
    });
    expect(answerAction(press("1"), ROLE_BUTTON, ctx())).toEqual({
      kind: "pick",
      index: 0,
    });
  });

  it("does nothing when no options are open (locked, or a flashcard not yet flipped)", () => {
    expect(answerAction(press("1"), BODY, ctx({ options: 0 }))).toBeNull();
  });

  it("does not pick with Ctrl, Meta or Alt held (Alt plus digit is a browser shortcut on some systems)", () => {
    expect(answerAction(press("1", { ctrlKey: true }), BODY, ctx())).toBeNull();
    expect(answerAction(press("1", { metaKey: true }), BODY, ctx())).toBeNull();
    expect(answerAction(press("1", { altKey: true }), BODY, ctx())).toBeNull();
  });

  it("does not pick on a key repeat, so holding a digit does not spam answers", () => {
    expect(answerAction(press("1", { repeat: true }), BODY, ctx())).toBeNull();
  });
});

describe("answerAction when the user is typing or a dialog is up", () => {
  it("never fires in an input, textarea or contenteditable", () => {
    for (const target of [INPUT, TEXTAREA, EDITABLE]) {
      expect(answerAction(press("1"), target, ctx())).toBeNull();
      expect(answerAction(press("ArrowLeft"), target, ctx())).toBeNull();
      expect(answerAction(press("Enter"), target, ctx())).toBeNull();
      expect(answerAction(press(" "), target, ctx())).toBeNull();
    }
  });

  it("stays out of the way while a dialog is open", () => {
    expect(
      answerAction(press("1"), BODY, ctx({ dialogOpen: true })),
    ).toBeNull();
    expect(
      answerAction(press("ArrowRight"), BODY, ctx({ dialogOpen: true })),
    ).toBeNull();
    expect(
      answerAction(press("Enter"), BODY, ctx({ dialogOpen: true })),
    ).toBeNull();
  });

  it("still picks when the event has no element target", () => {
    expect(answerAction(press("1"), null, ctx())).toEqual({
      kind: "pick",
      index: 0,
    });
  });
});

describe("answerAction arrows", () => {
  it("Left goes to the previous question, Right to the next", () => {
    expect(answerAction(press("ArrowLeft"), BODY, ctx())).toEqual({
      kind: "prev",
    });
    expect(answerAction(press("ArrowRight"), BODY, ctx())).toEqual({
      kind: "next",
    });
  });

  it("does nothing where there is no question in that direction", () => {
    expect(
      answerAction(press("ArrowLeft"), BODY, ctx({ prev: false })),
    ).toBeNull();
    expect(
      answerAction(press("ArrowRight"), BODY, ctx({ next: false })),
    ).toBeNull();
  });

  it("keeps Shift (text selection) and a live text selection to itself", () => {
    expect(
      answerAction(press("ArrowRight", { shiftKey: true }), BODY, ctx()),
    ).toBeNull();
    expect(
      answerAction(press("ArrowLeft"), BODY, ctx({ selecting: true })),
    ).toBeNull();
  });

  it("does not move with Ctrl, Meta or Alt held", () => {
    expect(
      answerAction(press("ArrowLeft", { altKey: true }), BODY, ctx()),
    ).toBeNull();
    expect(
      answerAction(press("ArrowRight", { ctrlKey: true }), BODY, ctx()),
    ).toBeNull();
  });

  it("lets arrows repeat, so holding one walks through questions", () => {
    expect(
      answerAction(press("ArrowRight", { repeat: true }), BODY, ctx()),
    ).toEqual({ kind: "next" });
  });
});

describe("answerAction Enter and Space", () => {
  it("Enter and Space act on the page", () => {
    expect(answerAction(press("Enter"), BODY, ctx())).toEqual({
      kind: "enter",
    });
    expect(answerAction(press(" "), BODY, ctx())).toEqual({ kind: "space" });
    expect(answerAction(press("Spacebar"), BODY, ctx())).toEqual({
      kind: "space",
    });
  });

  it("leave a focused control to its own native click", () => {
    expect(answerAction(press("Enter"), BUTTON, ctx())).toBeNull();
    expect(answerAction(press(" "), BUTTON, ctx())).toBeNull();
    expect(answerAction(press("Enter"), ROLE_BUTTON, ctx())).toBeNull();
    const link: KeyTarget = {
      tagName: "A",
      isContentEditable: false,
      role: null,
    };
    expect(answerAction(press("Enter"), link, ctx())).toBeNull();
  });

  it("do nothing when the surface has no Enter or Space action", () => {
    expect(
      answerAction(press("Enter"), BODY, ctx({ enter: false })),
    ).toBeNull();
    expect(answerAction(press(" "), BODY, ctx({ space: false }))).toBeNull();
  });

  it("do not repeat", () => {
    expect(
      answerAction(press("Enter", { repeat: true }), BODY, ctx()),
    ).toBeNull();
    expect(answerAction(press(" ", { repeat: true }), BODY, ctx())).toBeNull();
  });

  it("Shift plus Enter still acts (Shift is not one of the blocked modifiers for Enter)", () => {
    expect(
      answerAction(press("Enter", { shiftKey: true }), BODY, ctx()),
    ).toEqual({ kind: "enter" });
  });

  it("ignore keys that mean nothing here", () => {
    expect(answerAction(press("ArrowUp"), BODY, ctx())).toBeNull();
    expect(answerAction(press("ArrowDown"), BODY, ctx())).toBeNull();
    expect(answerAction(press("x"), BODY, ctx({ options: 0 }))).toBeNull();
  });
});

describe("isTypingTarget and isControlTarget", () => {
  it("types: input, textarea, select and contenteditable", () => {
    expect(isTypingTarget(INPUT)).toBe(true);
    expect(isTypingTarget(TEXTAREA)).toBe(true);
    expect(
      isTypingTarget({
        tagName: "SELECT",
        isContentEditable: false,
        role: null,
      }),
    ).toBe(true);
    expect(isTypingTarget(EDITABLE)).toBe(true);
    expect(isTypingTarget(BUTTON)).toBe(false);
    expect(isTypingTarget(null)).toBe(false);
  });

  it("controls: buttons, links, summaries, fields and ARIA button-like roles", () => {
    expect(isControlTarget(BUTTON)).toBe(true);
    expect(isControlTarget(ROLE_BUTTON)).toBe(true);
    expect(
      isControlTarget({
        tagName: "SUMMARY",
        isContentEditable: false,
        role: null,
      }),
    ).toBe(true);
    expect(isControlTarget(HEADING)).toBe(false);
    expect(isControlTarget(BODY)).toBe(false);
    expect(isControlTarget(null)).toBe(false);
  });
});

describe("answerAction on a live round (picks only)", () => {
  it("picks four ways with 1-4 and A-D on a four-choice question", () => {
    const picks = ["1", "2", "3", "4", "a", "b", "c", "d"].map((k) =>
      answerAction(
        press(k),
        BODY,
        ctx({ next: false, prev: false, enter: false, space: false }),
      ),
    );
    expect(picks.map((a) => (a && a.kind === "pick" ? a.index : null))).toEqual(
      [0, 1, 2, 3, 0, 1, 2, 3],
    );
  });
});

describe("answer hint labels", () => {
  it("describes the picks in the hint", () => {
    expect(answerKeysLabel(0)).toBe("");
    expect(answerKeysLabel(1)).toBe("1 answer");
    expect(answerKeysLabel(2)).toBe("1-2 answer");
    expect(answerKeysLabel(4)).toBe("1-4 answer");
    expect(answerKeysLabel(7)).toBe("1-5 answer");
  });

  it("builds the one-line hint and drops empty parts", () => {
    expect(keysLine("1-4 answer", "← → move")).toBe(
      "Keys: 1-4 answer · ← → move",
    );
    expect(keysLine("", "← → move")).toBe("Keys: ← → move");
    expect(keysLine("", "")).toBe("");
    expect(keysLine("Space flip", "1-2 mark")).toBe(
      "Keys: Space flip · 1-2 mark",
    );
  });
});

describe("digits only", () => {
  it("ignores letters when letters are off", () => {
    expect(pickIndex("a", 2, false)).toBeNull();
    expect(pickIndex("1", 2, false)).toBe(0);
    expect(pickIndex("2", 2, false)).toBe(1);
  });
});
