import { describe, expect, it } from "vitest";
import { BLC_ENABLED } from "./features";
import { bottomItemsFor, navItemsFor, questionsLocked, showJoinLink } from "./nav-items";

const hrefs = (items: { href: string }[]) => items.map((i) => i.href);

describe("navItemsFor", () => {
  it("members get the short list, in order", () => {
    expect(hrefs(navItemsFor(false))).toEqual([
      "/",
      "/events",
      "/questions",
      "/career",
      "/announcements",
      "/calendar",
      "/leaderboard",
      ...(BLC_ENABLED ? ["/blc"] : []),
      "/profile",
      "/more",
    ]);
  });

  it("execs add Members and Admin", () => {
    const list = hrefs(navItemsFor(true));
    expect(list).toContain("/members");
    expect(list).toContain("/admin");
    expect(hrefs(navItemsFor(false))).not.toContain("/admin");
    expect(hrefs(navItemsFor(false))).not.toContain("/members");
  });

  it("Developer shows only to the stats viewer, not to other execs", () => {
    expect(hrefs(navItemsFor(true, true))).toContain("/developer");
    expect(hrefs(navItemsFor(true))).not.toContain("/developer");
    expect(hrefs(navItemsFor(false, true))).toContain("/developer");
    expect(hrefs(navItemsFor(false))).not.toContain("/developer");
    expect(hrefs(bottomItemsFor(true, true))).not.toContain("/developer");
  });

  it("Leaderboard sits in the Chapter group; Career is in the main list", () => {
    const items = navItemsFor(false);
    expect(items.find((i) => i.href === "/leaderboard")?.chapter).toBe(true);
    expect(items.find((i) => i.href === "/career")?.chapter).toBeFalsy();
  });

  it("Tests and Flashcards are not in the nav; Settings lives under More", () => {
    const list = hrefs(navItemsFor(true));
    for (const gone of ["/tests", "/flashcards", "/settings"]) {
      expect(list).not.toContain(gone);
    }
  });

  it("Resources (/library) moved under Events; Questions is its own tab", () => {
    expect(hrefs(navItemsFor(false))).not.toContain("/library");
    const events = navItemsFor(false).find((i) => i.href === "/events")!;
    expect(events.match("/library")).toBe(true);
    const questions = navItemsFor(false).find((i) => i.href === "/questions");
    expect(questions?.chapter).toBeFalsy();
    expect(questions?.needsEvent).toBe(true);
  });
});

describe("active states", () => {
  const find = (href: string) =>
    navItemsFor(false).find((i) => i.href === href)!;

  it("Events is active on /events, a classroom's other tabs, a battle and the chapter shelf", () => {
    for (const path of [
      "/events",
      "/c/abc",
      "/c/new",
      "/c/abc/resources",
      "/battle/abc",
      "/library",
    ])
      expect(find("/events").match(path)).toBe(true);
    for (const path of ["/", "/questions"])
      expect(find("/events").match(path)).toBe(false);
  });

  it("Questions is active on its page and wherever you study: a room's tests and cards, a deck", () => {
    for (const path of [
      "/questions",
      "/c/abc/tests",
      "/c/abc/tests/t1/a/a1",
      "/c/abc/flashcards",
      "/flashcards/d1",
      "/tests",
    ]) {
      expect(find("/questions").match(path)).toBe(true);
      expect(find("/events").match(path)).toBe(false);
    }
    for (const path of ["/c/abc", "/c/abc/resources", "/c/abc/testsuite", "/career"])
      expect(find("/questions").match(path)).toBe(false);
  });

  it("More is active on More and Settings (Help is a Settings tab)", () => {
    for (const path of ["/more", "/settings", "/settings?tab=look", "/settings?tab=help"])
      expect(find("/more").match(path)).toBe(true);
    expect(find("/more").match("/profile")).toBe(false);
  });
});

describe("bottomItemsFor", () => {
  it("phones show Home, Events, Questions, Profile, More", () => {
    expect(hrefs(bottomItemsFor(false))).toEqual([
      "/",
      "/events",
      "/questions",
      "/profile",
      "/more",
    ]);
    expect(hrefs(bottomItemsFor(true))).toEqual(hrefs(bottomItemsFor(false)));
  });
});

describe("questionsLocked", () => {
  it("locks Questions until you're in an event", () => {
    expect(questionsLocked(0)).toBe(true);
    expect(questionsLocked(1)).toBe(false);
  });
});

describe("showJoinLink", () => {
  it("shows only to non-executives in no event", () => {
    expect(showJoinLink(false, 0)).toBe(true);
    expect(showJoinLink(false, 1)).toBe(false);
    expect(showJoinLink(true, 0)).toBe(false);
  });
});
