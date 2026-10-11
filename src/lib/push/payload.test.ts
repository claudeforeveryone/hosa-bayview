import { describe, expect, it } from "vitest";
import { buildPayload, safeLink, type NotificationFields } from "./payload";

const row: NotificationFields = {
  notification_id: "11111111-1111-4111-8111-111111111111",
  kind: "test",
  title: "New test: Medical Terminology",
  body: "Practice set is open.",
  link: "/c/abc/tests/def",
};

describe("safeLink", () => {
  it("keeps same-site paths", () => {
    expect(safeLink("/c/abc/tests/def")).toBe("/c/abc/tests/def");
    expect(safeLink("/")).toBe("/");
  });

  it("turns anything that could leave the site into the home page", () => {
    expect(safeLink("//evil.example/x")).toBe("/");
    expect(safeLink("https://evil.example")).toBe("/");
    expect(safeLink("javascript:alert(1)")).toBe("/");
    expect(safeLink("")).toBe("/");
    // A backslash after the slash is read as "//" by browsers.
    expect(safeLink(String.raw`/\evil.example`)).toBe("/");
    expect(safeLink(String.raw`/c/x\..\y`)).toBe("/");
  });
});

describe("buildPayload (notification preferences)", () => {
  it("is not silent when the device's notification sound is on", () => {
    expect(buildPayload(row, true)).toMatchObject({
      silent: false,
      url: "/c/abc/tests/def",
      tag: row.notification_id,
    });
  });

  it("is silent when the device's notification sound is off", () => {
    expect(buildPayload(row, false)).toMatchObject({ silent: true });
  });

  it("caps text the browser shows", () => {
    const long = { ...row, title: "t".repeat(400), body: "b".repeat(900) };
    const payload = buildPayload(long, true);
    expect(payload.title).toHaveLength(200);
    expect(payload.body).toHaveLength(500);
  });

  it("uses a safe URL even when the stored link is bad", () => {
    expect(
      buildPayload({ ...row, link: "https://evil.example" }, true).url,
    ).toBe("/");
  });
});
