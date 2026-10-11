import { describe, expect, it } from "vitest";
import { BLC_ENABLED } from "./features";
import { bottomItemsFor, navItemsFor, showJoinLink } from "./nav-items";

const hrefs = (items: { href: string }[]) => items.map((i) => i.href);

describe("navItemsFor", () => {
  it("members get the short list, in order", () => {
    expect(hrefs(navItemsFor(false))).toEqual([
      "/",
      "/events",
      "/career",
      "/announcements",
      "/calendar",
      "/leaderboard",
      ...(BLC_ENABLED ? ["/blc"] : []),
      "/library",
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

  it("Resources keeps the /library route", () => {
    const item = navItemsFor(false).find((i) => i.href === "/library");
    expect(item?.label).toBe("Resources");
  });
});

describe("active states", () => {
  const find = (href: string) =>
    navItemsFor(false).find((i) => i.href === href)!;

  it("Events is active on /events, every classroom path and a battle", () => {
    for (const path of [
      "/events",
      "/c/abc",
      "/c/new",
      "/c/abc/tests",
      "/battle/abc",
    ])
      expect(find("/events").match(path)).toBe(true);
    for (const path of ["/", "/library"])
      expect(find("/events").match(path)).toBe(false);
  });

  it("More is active on More and Settings (Help is a Settings tab)", () => {
    for (const path of ["/more", "/settings", "/settings?tab=look", "/settings?tab=help"])
      expect(find("/more").match(path)).toBe(true);
    expect(find("/more").match("/profile")).toBe(false);
  });
});

describe("bottomItemsFor", () => {
  it("phones show Home, Events, Calendar, Profile, More", () => {
    expect(hrefs(bottomItemsFor(false))).toEqual([
      "/",
      "/events",
      "/calendar",
      "/profile",
      "/more",
    ]);
    expect(hrefs(bottomItemsFor(true))).toEqual(hrefs(bottomItemsFor(false)));
  });
});

describe("showJoinLink", () => {
  it("shows only to non-executives in no event", () => {
    expect(showJoinLink(false, 0)).toBe(true);
    expect(showJoinLink(false, 1)).toBe(false);
    expect(showJoinLink(true, 0)).toBe(false);
  });
});
