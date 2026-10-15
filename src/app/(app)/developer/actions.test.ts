import { beforeEach, describe, expect, it, vi } from "vitest";
import { makeClient, type Result } from "@/test/chain-client";

// Feedback triage on /developer against a stand-in database: what reaches owner_triage_feedback (0232), and what the
// stats viewer reads for each answer it can give. The database checks the viewer itself (42501 for anyone else).

let client = makeClient({ data: null, error: null });
const refresh = vi.fn();
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => client }));
vi.mock("next/cache", () => ({ refresh: () => refresh() }));

const { setElo, triageFeedback } = await import("./actions");

const ID = "00000000-0000-4000-8000-0000000000f1";
const answer = (r: Result) => {
  client = makeClient(r);
};
const refusal = (code: string, message: string) =>
  answer({ data: null, error: { code, message } });

beforeEach(() => {
  answer({ data: null, error: null });
  refresh.mockClear();
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("triageFeedback", () => {
  it("saves the status, priority and trimmed note, then refreshes the page", async () => {
    expect(
      await triageFeedback(ID, "wont_fix", "high", "  Not this term.\r\n"),
    ).toEqual({ ok: true });
    expect(client.rpc).toHaveBeenCalledWith("owner_triage_feedback", {
      p_id: ID,
      p_status: "wont_fix",
      p_priority: "high",
      p_resolution: "Not this term.",
    });
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it("checks the id, status, priority and note length before the database", async () => {
    expect(await triageFeedback("nope", "done", "low", "")).toEqual({
      error: "That feedback is gone.",
    });
    expect(await triageFeedback(ID, "closed", "low", "")).toEqual({
      error: "Pick a status from the list.",
    });
    expect(await triageFeedback(ID, "done", "urgent", "")).toEqual({
      error: "Pick a priority from the list.",
    });
    expect(await triageFeedback(ID, "done", "low", "a".repeat(1001))).toEqual({
      error: "Keep the note under 1,000 characters.",
    });
    expect(client.rpc).not.toHaveBeenCalled();
  });

  it("explains a refusal: only accounts on the stats list can triage", async () => {
    refusal("42501", "Only stats viewers can see this");
    expect(await triageFeedback(ID, "done", "low", "")).toEqual({
      error: "Only accounts on the stats list can change this.",
    });
    expect(refresh).not.toHaveBeenCalled();
  });

  it("says the feedback is gone when the row was deleted", async () => {
    refusal("P0002", "That feedback is gone");
    expect(await triageFeedback(ID, "done", "low", "")).toEqual({
      error: "That feedback is gone.",
    });
  });

  it("shows the database's own reason for bad input", async () => {
    refusal("22023", "Keep the note under 1000 characters");
    expect(await triageFeedback(ID, "done", "low", "")).toEqual({
      error: "Keep the note under 1000 characters.",
    });
  });

  it("logs anything else and asks to try again", async () => {
    refusal("XX000", "connection reset by peer");
    expect(await triageFeedback(ID, "done", "low", "")).toEqual({
      error: "That didn't save. Try again.",
    });
    expect(console.error).toHaveBeenCalledWith(
      "Owner triage failed: connection reset by peer",
    );
    expect(refresh).not.toHaveBeenCalled();
  });
});

describe("setElo", () => {
  it("sends the member and the new Elo, then refreshes the page", async () => {
    answer({ data: 750, error: null });
    expect(await setElo(ID, 750)).toEqual({ ok: "Elo is now 750." });
    expect(client.rpc).toHaveBeenCalledWith("dev_set_elo", {
      p_user: ID,
      p_elo: 750,
    });
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it("checks the member and the number before the database", async () => {
    expect(await setElo("nope", 10)).toEqual({
      error: "Pick a member from the list.",
    });
    for (const bad of [-1, 1.5, 1_000_001, Number.NaN]) {
      expect(await setElo(ID, bad)).toEqual({
        error: "Pick a whole number from 0 to 1,000,000.",
      });
    }
    expect(client.rpc).not.toHaveBeenCalled();
  });

  it("explains a refusal: executives who aren't developers can't", async () => {
    refusal("42501", "Only developers can change Elo");
    expect(await setElo(ID, 5)).toEqual({
      error: "Only developers can change Elo.",
    });
    expect(refresh).not.toHaveBeenCalled();
  });

  it("says when the database doesn't have it yet", async () => {
    refusal("PGRST202", "Could not find the function");
    expect(await setElo(ID, 5)).toEqual({
      error: "This needs the latest database update (0292).",
    });
  });
});
