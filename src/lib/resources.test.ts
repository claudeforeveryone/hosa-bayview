import { describe, expect, it } from "vitest";
import { barWidth, cleanUrl, hostOf, parseTopics, topicTotal, totalState } from "./resources";

describe("cleanUrl", () => {
  it("keeps full http and https links", () => {
    expect(cleanUrl("https://example.com/guide")).toBe("https://example.com/guide");
    expect(cleanUrl("  http://example.com  ")).toBe("http://example.com/");
  });

  it("adds https to a bare host", () => {
    expect(cleanUrl("example.com/guide")).toBe("https://example.com/guide");
  });

  it("rejects other schemes, even when written in caps", () => {
    expect(cleanUrl("javascript:alert(1)")).toBeNull();
    expect(cleanUrl("JavaScript:alert(1)")).toBeNull();
    expect(cleanUrl("mailto:someone@example.com")).toBeNull();
    expect(cleanUrl("data:text/html,hi")).toBeNull();
    expect(cleanUrl("ftp://example.com")).toBeNull();
  });

  it("accepts host:port, which is not a scheme", () => {
    expect(cleanUrl("localhost:3000")).toBe("https://localhost:3000/");
    expect(cleanUrl("example.com:8080/notes?x=1")).toBe("https://example.com:8080/notes?x=1");
    expect(cleanUrl("https://example.com:8443/path")).toBe("https://example.com:8443/path");
  });

  it("still rejects other schemes that look close to host:port", () => {
    expect(cleanUrl("mailto:someone@example.com")).toBeNull();
    expect(cleanUrl("javascript:alert(1)")).toBeNull();
    expect(cleanUrl("https:example.com")).toBeNull();
  });

  it("rejects empty, spaced, and hostless input", () => {
    expect(cleanUrl("")).toBeNull();
    expect(cleanUrl("   ")).toBeNull();
    expect(cleanUrl("https://")).toBeNull();
    expect(cleanUrl("https://exa mple.com")).toBeNull();
  });

  it("rejects links longer than 2048 characters", () => {
    expect(cleanUrl(`https://example.com/${"a".repeat(2048)}`)).toBeNull();
  });
});

describe("hostOf", () => {
  it("shows the host without www", () => {
    expect(hostOf("https://www.example.com/a/b")).toBe("example.com");
  });
});

describe("parseTopics", () => {
  it("drops fully blank rows and keeps order", () => {
    const r = parseTopics([
      { topic: "Anatomy", percent: "60" },
      { topic: "", percent: "" },
      { topic: "  Physiology ", percent: " 40 " },
    ]);
    expect(r).toEqual({
      items: [
        { topic: "Anatomy", percent: 60 },
        { topic: "Physiology", percent: 40 },
      ],
    });
  });

  it("needs a name on any row that has a percent", () => {
    expect(parseTopics([{ topic: "", percent: "20" }]).error).toMatch(/topic name/);
  });

  it("only takes whole numbers from 0 to 100", () => {
    expect(parseTopics([{ topic: "A", percent: "101" }]).error).toMatch(/0 to 100/);
    expect(parseTopics([{ topic: "A", percent: "-5" }]).error).toMatch(/0 to 100/);
    expect(parseTopics([{ topic: "A", percent: "12.5" }]).error).toMatch(/0 to 100/);
    expect(parseTopics([{ topic: "A", percent: "" }]).error).toMatch(/0 to 100/);
    expect(parseTopics([{ topic: "A", percent: "0" }]).items).toEqual([{ topic: "A", percent: 0 }]);
    expect(parseTopics([{ topic: "A", percent: "100" }]).items).toEqual([{ topic: "A", percent: 100 }]);
  });

  it("caps the number of topics at 30", () => {
    const rows = Array.from({ length: 31 }, (_, i) => ({ topic: `T${i}`, percent: "1" }));
    expect(parseTopics(rows).error).toMatch(/30/);
  });

  it("caps topic names at 80 characters", () => {
    expect(parseTopics([{ topic: "x".repeat(81), percent: "5" }]).error).toMatch(/80/);
  });
});

describe("topic totals", () => {
  it("sums percents", () => {
    expect(topicTotal([{ percent: 60 }, { percent: 40 }])).toBe(100);
    expect(topicTotal([])).toBe(0);
  });

  it("says when the total is exact, short, or over", () => {
    expect(totalState(100)).toEqual({ state: "exact", off: 0 });
    expect(totalState(85)).toEqual({ state: "under", off: 15 });
    expect(totalState(110)).toEqual({ state: "over", off: 10 });
  });

  it("clamps bar widths to the track", () => {
    expect(barWidth(42)).toBe(42);
    expect(barWidth(-3)).toBe(0);
    expect(barWidth(180)).toBe(100);
  });
});
