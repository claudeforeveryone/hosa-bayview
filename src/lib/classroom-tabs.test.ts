import { describe, expect, it } from "vitest";
import { groupByCategory, tabsFor } from "./classroom-tabs";

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

  it("shows Other only when a room is uncategorised, and omits empty groups", () => {
    expect(groupByCategory([room("A", "mc")]).map((g) => g.heading)).toEqual(["MC"]);
    expect(groupByCategory([room("A", "mc"), room("B", null)]).map((g) => g.heading)).toEqual(["MC", "Other"]);
    expect(groupByCategory([])).toEqual([]);
  });
});

describe("tab labels", () => {
  it("the first tab is Overview", () => {
    expect(tabsFor(null, false)[0]).toEqual({ slug: "", label: "Overview" });
  });
});
