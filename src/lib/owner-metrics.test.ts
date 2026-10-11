import { describe, expect, it } from "vitest";
import {
  bucketLabel,
  checkFeedback,
  countText,
  dateText,
  deltaText,
  featureState,
  isStatsViewer,
  pageNumber,
  parseFeedbackFilter,
  parseRange,
  parseTab,
  percentText,
} from "./owner-metrics";

describe("countText", () => {
  it("says Under 5 for a hidden count, never a number", () => {
    expect(countText(null)).toBe("Under 5");
    expect(countText(undefined)).toBe("Under 5");
  });
  it("shows zero and real counts as they are", () => {
    expect(countText(0)).toBe("0");
    expect(countText(5)).toBe("5");
    expect(countText(2157)).toBe("2,157");
  });
});

describe("percentText", () => {
  it("rounds a share of a whole", () => {
    expect(percentText(18, 26)).toBe("69%");
    expect(percentText(5, 5)).toBe("100%");
  });
  it("shows nothing when either side is hidden or there is no whole", () => {
    expect(percentText(null, 26)).toBeNull();
    expect(percentText(18, null)).toBeNull();
    expect(percentText(0, 0)).toBeNull();
  });
});

describe("deltaText", () => {
  it("compares this week with the week before in words", () => {
    expect(deltaText(9, 6, "the week before")).toBe(
      "3 more than the week before",
    );
    expect(deltaText(6, 9, "the week before")).toBe(
      "3 fewer than the week before",
    );
    expect(deltaText(7, 7, "the week before")).toBe("Same as the week before");
  });
  it("says nothing when either week is hidden, so a small count can't be worked out", () => {
    expect(deltaText(9, null, "the week before")).toBeNull();
    expect(deltaText(null, 9, "the week before")).toBeNull();
  });
});

describe("parsing the address bar", () => {
  it("reads a range, defaulting to 30 days", () => {
    expect(parseRange("7d")).toBe("7d");
    expect(parseRange("all")).toBe("all");
    expect(parseRange("1y")).toBe("30d");
    expect(parseRange(["7d", "90d"])).toBe("30d");
    expect(parseRange(undefined)).toBe("30d");
  });
  it("reads a section, defaulting to the overview", () => {
    expect(parseTab("members")).toBe("members");
    expect(parseTab("feedback")).toBe("feedback");
    expect(parseTab("secrets")).toBe("overview");
    expect(parseTab(undefined)).toBe("overview");
  });
  it("reads a feedback filter, defaulting to open", () => {
    expect(parseFeedbackFilter("wont_fix")).toBe("wont_fix");
    expect(parseFeedbackFilter("all")).toBe("all");
    expect(parseFeedbackFilter("closed")).toBe("open");
  });
  it("reads a page number, refusing junk and silly values", () => {
    expect(pageNumber("3")).toBe(3);
    expect(pageNumber("-1")).toBe(0);
    expect(pageNumber("2.5")).toBe(0);
    expect(pageNumber("1e9")).toBe(0);
    expect(pageNumber(undefined)).toBe(0);
  });
});

describe("isStatsViewer", () => {
  it("opens the console only for a literal true from the database", () => {
    expect(isStatsViewer(true)).toBe(true);
    expect(isStatsViewer("true")).toBe(false);
    expect(isStatsViewer(1)).toBe(false);
    expect(isStatsViewer(null)).toBe(false);
    expect(isStatsViewer({ ok: true })).toBe(false);
  });
});

describe("bucketLabel", () => {
  it("names a Toronto day", () => {
    expect(bucketLabel("2026-10-05", "2026-10-05")).toBe("Oct 5");
  });
  it("names a week by its two ends", () => {
    expect(bucketLabel("2026-09-28", "2026-10-04")).toBe("Sep 28 to Oct 4");
  });
});

describe("dateText", () => {
  it("gives the Toronto calendar day of a moment", () => {
    // 01:30 UTC on Sep 29 is still the evening of Sep 28 in Toronto.
    expect(dateText("2026-09-29T01:30:00Z")).toBe("Sep 28, 2026");
    expect(dateText("2026-09-29T16:00:00+00:00")).toBe("Sep 29, 2026");
  });
});

describe("featureState", () => {
  it("separates never recorded from hidden from shown", () => {
    expect(
      featureState({ source: "tracked", tracked_since: null, count: 0 }),
    ).toBe("untracked");
    expect(
      featureState({
        source: "tracked",
        tracked_since: "2026-10-10T12:00:00Z",
        count: null,
      }),
    ).toBe("hidden");
    expect(
      featureState({ source: "table", tracked_since: null, count: 0 }),
    ).toBe("shown");
    expect(
      featureState({ source: "table", tracked_since: null, count: null }),
    ).toBe("hidden");
  });
});

describe("checkFeedback", () => {
  it("passes a short note in a known category", () => {
    expect(checkFeedback("bug", "The timer froze.")).toBeNull();
  });
  it("names the problem the way the database would", () => {
    expect(checkFeedback("rant", "hi")).toBe(
      "Pick bug, idea or something else.",
    );
    expect(checkFeedback("idea", "   ")).toBe("Write a few words first.");
    expect(checkFeedback("idea", "a".repeat(1001))).toBe(
      "Keep it under 1,000 characters.",
    );
  });
});
