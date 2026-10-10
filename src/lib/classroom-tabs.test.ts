import { describe, expect, it } from "vitest";
import { tabsFor } from "./classroom-tabs";

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
