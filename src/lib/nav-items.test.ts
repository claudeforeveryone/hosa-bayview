import { describe, expect, it } from "vitest";
import { bottomItemsFor, navItemsFor } from "./nav-items";

const hrefs = (items: { href: string }[]) => items.map((i) => i.href);

describe("navItemsFor", () => {
  it("members get the short list, in order", () => {
    expect(hrefs(navItemsFor(false))).toEqual([
      "/",
      "/events",
      "/announcements",
      "/calendar",
      "/library",
      "/profile",
      "/settings",
    ]);
  });

  it("execs add Members and Admin", () => {
    const list = hrefs(navItemsFor(true));
    expect(list).toContain("/members");
    expect(list).toContain("/admin");
    expect(hrefs(navItemsFor(false))).not.toContain("/admin");
  });

  it("Leaderboard, Tests, Flashcards and BLC are not in the nav", () => {
    const list = hrefs(navItemsFor(true));
    for (const gone of ["/leaderboard", "/tests", "/flashcards", "/blc"]) {
      expect(list).not.toContain(gone);
    }
  });

  it("Resources keeps the /library route", () => {
    const item = navItemsFor(false).find((i) => i.href === "/library");
    expect(item?.label).toBe("Resources");
  });
});

describe("Events active state", () => {
  const events = navItemsFor(false).find((i) => i.href === "/events")!;

  it("is active on /events and every classroom path", () => {
    for (const path of ["/events", "/c/abc", "/c/new", "/c/abc/tests"])
      expect(events.match(path)).toBe(true);
  });

  it("is not active elsewhere", () => {
    for (const path of ["/", "/library"])
      expect(events.match(path)).toBe(false);
  });
});

describe("bottomItemsFor", () => {
  it("phones show Home, Events, News, Calendar, Profile", () => {
    expect(hrefs(bottomItemsFor(false))).toEqual([
      "/",
      "/events",
      "/announcements",
      "/calendar",
      "/profile",
    ]);
    expect(hrefs(bottomItemsFor(true))).toEqual(hrefs(bottomItemsFor(false)));
  });
});
