import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { SkillCard } from "./skill-card";

const text = (markup: string) =>
  markup
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();

describe("SkillCard", () => {
  it("renders the steps in order as unticked checkboxes with points and a total", () => {
    const out = renderToStaticMarkup(
      createElement(SkillCard, {
        name: "Prescription label",
        round: "Round 1",
        steps: [
          { text: "Read the order", points: 2 },
          { text: "Count tablets" },
          { text: "Label", points: 1 },
        ],
        note: null,
      }),
    );
    expect(text(out)).toContain(
      "Prescription label Round 1 · 3 steps · 3 points",
    );
    expect(text(out)).toContain(
      "1 Read the order 2 pts 2 Count tablets 3 Label 1 pt",
    );
    expect(text(out)).toContain("0/3 done · 0/3 points");
    expect(out.match(/type="checkbox"/g)).toHaveLength(3);
    expect(out).not.toContain("checked");
    expect(out).not.toContain("Clear");
  });

  it("shows only the note for a skill that has a name but no steps", () => {
    const out = renderToStaticMarkup(
      createElement(SkillCard, {
        name: "Oral exam",
        round: null,
        steps: [],
        note: "Steps: see the official HOSA guidelines",
      }),
    );
    expect(text(out)).toBe("Oral exam Steps: see the official HOSA guidelines");
    expect(out).not.toContain("checkbox");
  });

  it("leaves points out when no step is scored", () => {
    const out = renderToStaticMarkup(
      createElement(SkillCard, {
        name: "A",
        round: null,
        steps: [{ text: "One" }],
        note: null,
      }),
    );
    expect(text(out)).toContain("A 1 step");
    expect(text(out)).not.toContain("point");
    expect(text(out)).toContain("0/1 done");
  });
});
