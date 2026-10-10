import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { HubResources, PracticeStrip } from "./event-hub";

const html = (el: Parameters<typeof renderToStaticMarkup>[0]) =>
  renderToStaticMarkup(el);
const text = (markup: string) =>
  markup
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();

describe("HubResources", () => {
  it("lists sections with counts, General first and Textbooks last, each opening the Resources tab", () => {
    const out = html(
      createElement(HubResources, {
        base: "/c/room",
        canManage: false,
        rows: [
          { section: "Textbooks" },
          { section: null },
          { section: "Week 2" },
          { section: "Week 2" },
          { section: null },
        ],
      }),
    );
    expect(text(out)).toBe("Resources General 2 Week 2 2 Textbooks 1");
    expect(out.match(/href="\/c\/room\/resources"/g)).toHaveLength(3);
  });

  it("shows a calm empty state for a room with no materials", () => {
    const member = html(
      createElement(HubResources, {
        base: "/c/room",
        canManage: false,
        rows: [],
      }),
    );
    expect(text(member)).toBe("Resources No resources yet");
    expect(member).not.toContain("href");
    const manager = html(
      createElement(HubResources, {
        base: "/c/room",
        canManage: true,
        rows: [],
      }),
    );
    expect(text(manager)).toContain("Add a file or link");
    expect(manager).toContain('href="/c/room/resources"');
  });
});

describe("PracticeStrip", () => {
  it("links each count to its tab and shows the drafts note when given", () => {
    const out = html(
      createElement(PracticeStrip, {
        base: "/c/room",
        cells: [
          { slug: "tests", label: "Tests", count: 0, extra: "3 drafts" },
          { slug: "flashcards", label: "Decks", count: 4 },
          { slug: "skills", label: "Skills", count: 7 },
        ],
      }),
    );
    expect(text(out)).toBe("Practice 0 Tests 3 drafts 4 Decks 7 Skills");
    expect(out).toContain('href="/c/room/skills"');
    expect(out).toContain("grid-cols-3");
  });
});
