import { describe, expect, it } from "vitest";
import { safeNext } from "./safe-next";

describe("safeNext", () => {
  it("keeps same-site paths", () => {
    expect(safeNext("/profile")).toBe("/profile");
    expect(safeNext("/c/123?tab=tests")).toBe("/c/123?tab=tests");
  });

  it("rejects anything that could leave the site", () => {
    for (const bad of [
      "https://evil.com",
      "//evil.com",
      "/\\evil.com",
      "javascript:alert(1)",
      "/\t/evil.com",
      "/\n/evil.com",
      "/\r/evil.com",
      "/%09/evil.com",
      "/ /evil.com",
      "/..//evil.com",
      "/.//evil.com",
      "/a/../..//evil.com",
      "/%2e%2e//evil.com",
    ]) {
      const out = safeNext(bad);
      expect(new URL(out, "https://hosa.example").origin, bad).toBe("https://hosa.example");
    }
    expect(safeNext("/\t/evil.com")).toBe("/");
    expect(safeNext("/..//evil.com")).toBe("/");
  });

  it("normalises harmless dot segments", () => {
    expect(safeNext("/c/../profile")).toBe("/profile");
  });

  it("falls back on empty or missing values", () => {
    expect(safeNext(null)).toBe("/");
    expect(safeNext("")).toBe("/");
    expect(safeNext(undefined, "/home")).toBe("/home");
  });
});
