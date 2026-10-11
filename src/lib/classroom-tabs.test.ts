import { describe, expect, it } from "vitest";
import {
  eventsLanding,
  groupByCategory,
  parseRecentRooms,
  pushRecentRoom,
  tabClearScroll,
  tabsFor,
} from "./classroom-tabs";

const slugs = (tabs: { slug: string }[]) => tabs.map((t) => t.slug);

describe("tabsFor", () => {
  it("showcase rooms have no Tests and no Skills", () => {
    const tabs = slugs(tabsFor("showcase", false));
    expect(tabs).not.toContain("tests");
    expect(tabs).not.toContain("skills");
    expect(tabs).toContain("resources");
  });

  it("practical rooms get Skills", () => {
    expect(slugs(tabsFor("practical", false))).toContain("skills");
    expect(slugs(tabsFor("practical", false))).toContain("tests");
  });

  it("MC and uncategorized rooms keep Tests without Skills", () => {
    for (const category of ["mc", null] as const) {
      const tabs = slugs(tabsFor(category, false));
      expect(tabs).toContain("tests");
      expect(tabs).not.toContain("skills");
    }
  });

  it("the hub comes first", () => {
    expect(tabsFor("practical", true)[0].slug).toBe("");
  });

  it("only managers get Grades and Settings", () => {
    expect(slugs(tabsFor("mc", false))).not.toContain("settings");
    expect(slugs(tabsFor("mc", false))).not.toContain("grades");
    expect(slugs(tabsFor("mc", true)).slice(-2)).toEqual(["grades", "settings"]);
  });
});

describe("groupByCategory", () => {
  const room = (name: string, category: "mc" | "practical" | "showcase" | null) => ({ name, category });

  it("orders MC, Practical, Showcase and sorts rooms A to Z", () => {
    const groups = groupByCategory([
      room("Public Health", "showcase"),
      room("Nutrition", "mc"),
      room("Dental Science", "practical"),
      room("Epidemiology", "mc"),
    ]);
    expect(groups.map((g) => g.heading)).toEqual(["MC", "Practical", "Showcase"]);
    expect(groups[0].rooms.map((r) => r.name)).toEqual(["Epidemiology", "Nutrition"]);
  });

  it("puts uncategorised rooms first without a heading, and omits empty groups", () => {
    expect(groupByCategory([room("A", "mc")]).map((g) => g.heading)).toEqual(["MC"]);
    expect(groupByCategory([room("A", "mc"), room("B", null)]).map((g) => g.heading)).toEqual([null, "MC"]);
    expect(groupByCategory([])).toEqual([]);
  });
});

describe("eventsLanding", () => {
  const A = { id: "a", name: "Alpha" };
  const B = { id: "b", name: "Bravo" };
  const C = { id: "c", name: "Charlie" };

  it("sends a member with one room straight into it", () => {
    expect(eventsLanding([A], { mineIds: new Set(), seesAll: false })).toEqual({ go: A });
  });

  it("lists several rooms, most recently visited first", () => {
    expect(eventsLanding([A, B, C], { mineIds: new Set(), recentIds: ["c"], seesAll: false })).toEqual({
      mine: [C, A, B],
      rest: [],
    });
  });

  it("never redirects an executive, and puts their own rooms first", () => {
    expect(eventsLanding([C, B, A], { mineIds: new Set(["b"]), seesAll: true })).toEqual({
      mine: [B],
      rest: [C, A],
    });
  });

  it("an executive's recently visited rooms float up with their own", () => {
    const r = eventsLanding([A, B, C], { mineIds: new Set(["a"]), recentIds: ["c"], seesAll: true });
    expect(r).toEqual({ mine: [C, A], rest: [B] });
  });

  it("no rooms is an empty list, not a redirect", () => {
    expect(eventsLanding([], { mineIds: new Set(), seesAll: false })).toEqual({ mine: [], rest: [] });
  });
});

describe("recent rooms cookie", () => {
  const u1 = "11111111-1111-4111-8111-111111111111";
  const u2 = "22222222-2222-4222-8222-222222222222";

  it("drops junk and duplicates", () => {
    expect(parseRecentRooms(`${u1},nope,${u1},${u2}`)).toEqual([u1, u2]);
    expect(parseRecentRooms(undefined)).toEqual([]);
    expect(parseRecentRooms("%E0%A4%A")).toEqual([]);
  });

  it("moves a visit to the front and caps the list", () => {
    expect(pushRecentRoom(`${u1},${u2}`, u2)).toBe(`${u2},${u1}`);
    expect(pushRecentRoom(null, "bad")).toBe("");
    const many = Array.from({ length: 10 }, (_, i) => `${String(i).repeat(8)}-1111-4111-8111-111111111111`);
    expect(pushRecentRoom(many.join(","), u1).split(",")).toHaveLength(8);
  });
});

describe("tab labels", () => {
  it("the first tab is Overview", () => {
    expect(tabsFor(null, false)[0]).toEqual({ slug: "", label: "Overview" });
  });
});

// Measured on a 390px phone: chevrons are 40px wide, so a tab needs 48px clear of each edge.
describe("tabClearScroll", () => {
  const strip = { width: 390, edge: 48 };

  it("leaves the strip alone when the tab is already clear of both chevrons", () => {
    expect(tabClearScroll({ ...strip, scrollLeft: 0, left: 100, right: 180 })).toBeNull();
  });

  it("scrolls just far enough to bring a tab out from under the right chevron", () => {
    // People at 316-385: 35px of it sat under the right chevron (350-390).
    expect(tabClearScroll({ ...strip, scrollLeft: 0, left: 316, right: 385 })).toBe(43);
  });

  it("brings a tab that is almost fully off screen into view", () => {
    // Attendance at 385-487 was hidden entirely behind the chevron.
    expect(tabClearScroll({ ...strip, scrollLeft: 0, left: 385, right: 487 })).toBe(145);
  });

  it("scrolls back for a tab under the left chevron", () => {
    expect(tabClearScroll({ ...strip, scrollLeft: 200, left: 220, right: 300 })).toBe(172);
  });

  it("never asks for a negative scroll, and skips a no-op", () => {
    // The first tab sits at 16 (the strip's padding); there's no left chevron at scroll 0.
    expect(tabClearScroll({ ...strip, scrollLeft: 0, left: 16, right: 110 })).toBeNull();
    expect(tabClearScroll({ ...strip, scrollLeft: 30, left: 16, right: 110 })).toBe(0);
  });

  it("keeps the start of a tab wider than the clear space in view", () => {
    expect(tabClearScroll({ ...strip, scrollLeft: 0, left: 400, right: 800 })).toBe(352);
  });
});
