import { describe, expect, it } from "vitest";
import { MARK_FAILED, sendMark } from "./review-mark";

describe("sendMark", () => {
  it("is null when the mark saved", async () => {
    expect(await sendMark(() => Promise.resolve({}))).toBeNull();
  });

  it("turns a server action that can't reach the server into a message, not a crash", async () => {
    // Before the fix the rejection escaped the transition and the error page replaced the study round.
    await expect(
      sendMark(() => Promise.reject(new TypeError("Failed to fetch"))),
    ).resolves.toBe(MARK_FAILED);
  });

  it("says the mark didn't save when the server refuses it", async () => {
    expect(
      await sendMark(() => Promise.resolve({ error: "That didn't save. Try again." })),
    ).toBe(MARK_FAILED);
  });

  it("treats an empty reply as a failed mark", async () => {
    expect(
      await sendMark(() => Promise.resolve(undefined as unknown as { error?: string })),
    ).toBe(MARK_FAILED);
  });
});
