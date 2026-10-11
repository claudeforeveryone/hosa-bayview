import { describe, expect, it } from "vitest";
import { sheetItemsFor } from "./nav-items";

const hrefs = (items: { href: string }[]) => items.map((i) => i.href);

// The phone bar's More sheet must reach the owner console for the site owner, and only for them (the page itself
// and every owner_* function check the same viewer list again on the server).
describe("phone More sheet and the owner console", () => {
  it("lists Developer for the stats viewer", () => {
    expect(hrefs(sheetItemsFor(false, true))).toContain("/developer");
    expect(hrefs(sheetItemsFor(true, true))).toContain("/developer");
  });

  it("never lists it for anyone else", () => {
    expect(hrefs(sheetItemsFor(false))).not.toContain("/developer");
    expect(hrefs(sheetItemsFor(true))).not.toContain("/developer");
    expect(hrefs(sheetItemsFor(true, false))).not.toContain("/developer");
  });
});
