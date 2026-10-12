import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { CareerPracticePanel } from "./career-practice-panel";

const render = (counts: {
  favorites: number;
  all: number;
  right: number;
  wrong: number;
}) => renderToStaticMarkup(createElement(CareerPracticePanel, { counts }));

describe("CareerPracticePanel", () => {
  it("links each set with something in it to its quick quiz, full quiz and flashcards", () => {
    const html = render({ favorites: 2, all: 30, right: 18, wrong: 12 });
    for (const set of ["favorites", "all", "right", "wrong"]) {
      expect(html).toContain(`href="/career/quiz?set=${set}&amp;size=quick"`);
      expect(html).toContain(
        `href="/career/quiz?set=${set}&amp;size=complete"`,
      );
      expect(html).toContain(`href="/career/flashcards?set=${set}"`);
    }
    expect(html).toContain('href="/career?tab=questions"');
    expect(html).toContain("Quiz yourself");
  });

  it("gives an empty set a hint instead of dead buttons", () => {
    const html = render({ favorites: 0, all: 5, right: 5, wrong: 0 });
    expect(html).not.toContain("set=favorites");
    expect(html).not.toContain("set=wrong");
    expect(html).toContain("set=all");
    expect(html).toContain("Nothing to fix right now");
    expect(html).toContain("Star a question under");
  });

  it("names the set on each repeated action for screen readers", () => {
    const html = render({ favorites: 1, all: 1, right: 1, wrong: 1 });
    expect(html).toContain('<span class="sr-only">: Got wrong</span>');
    expect(html).toContain(">1</span>");
    expect(html).toContain(">question</span>");
  });
});
