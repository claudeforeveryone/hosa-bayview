import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { SubmitBar } from "./submit-bar";

const text = (markup: string) =>
  markup
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .replace(/&#x27;/g, "'")
    .trim();
const noop = () => {};
const bar = (props: Partial<Parameters<typeof SubmitBar>[0]>) =>
  renderToStaticMarkup(
    createElement(SubmitBar, {
      practice: true,
      confirming: false,
      left: 0,
      submitting: false,
      problem: null,
      onFinish: noop,
      onSubmitNow: noop,
      onKeepGoing: noop,
      ...props,
    }),
  );

// On a long test the question grid pushes the submit buttons far below the question, so a submit's problem
// shows here, beside the button just tapped, not up with the question where it would be off screen.
describe("SubmitBar", () => {
  it("shows a lost pick's warning right after Submit now, naming that button", () => {
    const out = bar({
      confirming: true,
      left: 1,
      problem: { kind: "unsaved", numbers: [1] },
    });
    expect(text(out)).toBe(
      "1 question still blank. Submit anyway? Submit now Keep going Question 1 didn't save. Pick it again, or tap Submit now to hand in what's saved.",
    );
    expect(out.indexOf('role="alert"')).toBeGreaterThan(
      out.indexOf("Submit now"),
    );
  });

  it("names Finish when the blank step is closed", () => {
    expect(text(bar({ problem: { kind: "offline" } }))).toBe(
      "Finish That didn't go through. Check your connection, then tap Finish.",
    );
  });

  it("says Submit on a timed test and shows no alert when nothing went wrong", () => {
    const out = bar({ practice: false });
    expect(text(out)).toBe("Submit");
    expect(out).not.toContain('role="alert"');
  });

  it("locks the buttons while a submit runs", () => {
    const out = bar({ confirming: true, left: 2, submitting: true });
    expect(text(out)).toContain("2 questions still blank. Submit anyway? Submitting Keep going");
    expect(out.match(/disabled=""/g)).toHaveLength(2);
  });
});
