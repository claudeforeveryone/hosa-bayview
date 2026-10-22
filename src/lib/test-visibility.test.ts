import { describe, expect, it } from "vitest";
import {
  arrowTarget,
  hiddenLabel,
  tapSaves,
  visibilityOf,
} from "./test-visibility";

describe("visibilityOf", () => {
  it("reads posted first, then a schedule, else hidden", () => {
    expect(visibilityOf(true, null)).toBe("posted");
    expect(visibilityOf(true, "2026-10-27T13:00:00.000Z")).toBe("posted");
    expect(visibilityOf(false, "2026-10-27T13:00:00.000Z")).toBe("scheduled");
    expect(visibilityOf(false, null)).toBe("hidden");
  });
});

describe("tapSaves", () => {
  it("posts or hides at once when the tap changes something", () => {
    expect(tapSaves("hidden", "posted")).toBe("post");
    expect(tapSaves("scheduled", "posted")).toBe("post");
    expect(tapSaves("posted", "hidden")).toBe("hide");
    expect(tapSaves("scheduled", "hidden")).toBe("hide");
  });

  it("saves nothing for Scheduled (it waits for Save) or for the state already saved", () => {
    expect(tapSaves("hidden", "scheduled")).toBeNull();
    expect(tapSaves("posted", "scheduled")).toBeNull();
    expect(tapSaves("scheduled", "scheduled")).toBeNull();
    expect(tapSaves("hidden", "hidden")).toBeNull();
    expect(tapSaves("posted", "posted")).toBeNull();
  });
});

describe("arrowTarget", () => {
  it("moves focus one segment either way and wraps at the ends", () => {
    expect(arrowTarget("ArrowRight", 0, 3)).toBe(1);
    expect(arrowTarget("ArrowDown", 2, 3)).toBe(0);
    expect(arrowTarget("ArrowLeft", 0, 3)).toBe(2);
    expect(arrowTarget("ArrowUp", 1, 3)).toBe(0);
  });

  it("leaves every other key, and a focus outside the group, to the browser", () => {
    expect(arrowTarget(" ", 0, 3)).toBeNull();
    expect(arrowTarget("Enter", 0, 3)).toBeNull();
    expect(arrowTarget("Tab", 0, 3)).toBeNull();
    expect(arrowTarget("ArrowRight", -1, 3)).toBeNull();
    expect(arrowTarget("ArrowRight", 0, 0)).toBeNull();
  });
});

describe("hiddenLabel", () => {
  it("says when a scheduled test posts, Hidden otherwise, and nothing once posted", () => {
    expect(hiddenLabel(false, "2026-10-27T13:00:00.000Z")).toMatch(
      /^Posts Tue, Oct\.? 27, 9:00 a\.m\.$/,
    );
    expect(hiddenLabel(false, null)).toBe("Hidden");
    expect(hiddenLabel(false, undefined)).toBe("Hidden");
    expect(hiddenLabel(true, null)).toBeNull();
  });
});
