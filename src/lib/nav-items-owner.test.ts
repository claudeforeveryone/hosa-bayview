import { describe, expect, it } from "vitest";
import { moreItemsFor, sheetItemsFor } from "./nav-items";

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

// Send feedback (0231) sits in the More group, the phone More sheet and /more, but only once the database has it:
// before that it would be a link to a form that can't send.
describe("Send feedback in More", () => {
  const FEEDBACK = "/settings?tab=account#feedback-h";

  it("is listed for every member once feedback is on", () => {
    expect(hrefs(moreItemsFor(false, true))).toContain(FEEDBACK);
    expect(hrefs(moreItemsFor(true, true))).toContain(FEEDBACK);
    expect(hrefs(sheetItemsFor(false, false, true))).toContain(FEEDBACK);
  });

  it("is hidden while feedback is off", () => {
    expect(hrefs(moreItemsFor(false))).not.toContain(FEEDBACK);
    expect(hrefs(moreItemsFor(true, false))).not.toContain(FEEDBACK);
    expect(hrefs(sheetItemsFor(false, true))).not.toContain(FEEDBACK);
  });

  it("never lights up as the current page next to Settings", () => {
    const item = moreItemsFor(false, true).find((i) => i.href === FEEDBACK);
    expect(item?.match("/settings")).toBe(false);
  });
});
