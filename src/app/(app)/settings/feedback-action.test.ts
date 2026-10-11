import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { makeClient, type Result } from "@/test/chain-client";

// Settings > Send feedback against a stand-in database: what reaches send_feedback (0231), and what the member reads
// for each answer it can give.

let client = makeClient({ data: null, error: null });
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => client }));
vi.mock("@/lib/auth", () => ({
  requireProfile: async () => ({ id: "11111111-1111-4111-8111-111111111111" }),
}));

const { sendFeedback } = await import("./feedback-action");

const answer = (r: Result) => {
  client = makeClient(r);
};
const refusal = (code: string, message: string) =>
  answer({ data: null, error: { code, message } });

beforeEach(() => {
  answer({ data: "00000000-0000-4000-8000-0000000000f1", error: null });
  vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => {
  vi.unstubAllEnvs();
});

describe("sendFeedback", () => {
  it("sends the trimmed words with the build the server is running, never one from the browser", async () => {
    vi.stubEnv("VERCEL_GIT_COMMIT_SHA", "a1b2c3d4e5f6");
    expect(await sendFeedback("bug", "  The timer froze.\r\n  ")).toEqual({
      ok: "Sent. Thanks for telling us.",
    });
    expect(client.rpc).toHaveBeenCalledWith("send_feedback", {
      p_category: "bug",
      p_body: "The timer froze.",
      p_build: "a1b2c3d4e5f6",
    });
  });

  it("sends no build when the variable isn't a commit", async () => {
    vi.stubEnv("VERCEL_GIT_COMMIT_SHA", "not a commit");
    await sendFeedback("idea", "Dark mode for the calendar");
    expect(client.rpc).toHaveBeenCalledWith(
      "send_feedback",
      expect.objectContaining({ p_build: null }),
    );
  });

  it("checks the words and the category before the database", async () => {
    expect((await sendFeedback("idea", "   ")).error).toBeTruthy();
    expect((await sendFeedback("rant", "Hello")).error).toBeTruthy();
    expect((await sendFeedback("idea", "a".repeat(1001))).error).toBeTruthy();
    expect(client.rpc).not.toHaveBeenCalled();
  });

  // send_feedback's own words (RAISE ... 22023 / 53400) are plain sentences, shown as they are.
  it("shows the database's own reason for bad input and the daily limit", async () => {
    refusal("22023", "Write a few words first");
    expect(await sendFeedback("idea", "Hello")).toEqual({
      error: "Write a few words first.",
    });
    refusal("53400", "That's plenty for today. Try again tomorrow");
    expect(await sendFeedback("idea", "Hello")).toEqual({
      error: "That's plenty for today. Try again tomorrow.",
    });
  });

  it("explains a refusal (a banned account) without the database's words", async () => {
    refusal("42501", "Sign in first");
    expect(await sendFeedback("idea", "Hello")).toEqual({
      error: "Your account can't send feedback right now.",
    });
  });

  for (const code of ["PGRST202", "42883"])
    it(`says feedback isn't on yet when send_feedback is missing (${code})`, async () => {
      refusal(code, "Could not find the function");
      expect(await sendFeedback("idea", "Hello")).toEqual({
        error: "Feedback isn't switched on yet. Try again soon.",
      });
    });

  it("logs anything else and asks the member to try again, without the database's words", async () => {
    refusal("XX000", "connection reset by peer");
    expect(await sendFeedback("idea", "Hello")).toEqual({
      error: "That didn't send. Try again.",
    });
    expect(console.error).toHaveBeenCalledWith(
      "Feedback did not save: connection reset by peer",
    );
  });
});
