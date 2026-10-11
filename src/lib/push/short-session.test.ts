import { describe, expect, it } from "vitest";
import { isShortSession } from "./short-session";

describe("isShortSession", () => {
  it("reads the Stay signed in marker from a Cookie header or document.cookie", () => {
    expect(isShortSession("hosa-short-session=1")).toBe(true);
    expect(isShortSession("a=b; hosa-short-session=1; c=d")).toBe(true);
    expect(isShortSession("a=b;hosa-short-session=1")).toBe(true);
  });

  it("is false without the marker, or with any other value", () => {
    expect(isShortSession(null)).toBe(false);
    expect(isShortSession("")).toBe(false);
    expect(isShortSession("hosa-short-session=0")).toBe(false);
    expect(isShortSession("hosa-short-session=")).toBe(false);
    expect(isShortSession("xhosa-short-session=1")).toBe(false);
  });
});
