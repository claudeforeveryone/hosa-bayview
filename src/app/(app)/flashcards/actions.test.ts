import { beforeEach, describe, expect, it, vi } from "vitest";
import { makeClient } from "@/test/chain-client";

let client = makeClient({ data: null, error: null });

vi.mock("@/lib/supabase/server", () => ({ createClient: async () => client }));
vi.mock("next/cache", () => ({ refresh: vi.fn() }));
vi.mock("next/navigation", () => ({
  redirect: (to: string) => {
    throw Object.assign(new Error("NEXT_REDIRECT"), { to });
  },
}));
vi.mock("@/lib/auth", () => ({
  requireProfile: async () => ({
    id: "11111111-1111-4111-8111-111111111111",
    role: "trainee",
  }),
}));

const { createBlankDeck } = await import("./actions");

const DECK = "55555555-5555-4555-8555-555555555555";
const redirectOf = async (p: Promise<unknown>) => {
  try {
    await p;
  } catch (e) {
    return (e as { to?: string }).to;
  }
  return undefined;
};

beforeEach(() => {
  client = makeClient({ data: { id: DECK }, error: null });
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("createBlankDeck", () => {
  it("inserts a personal untitled deck and opens it to rename", async () => {
    expect(await redirectOf(createBlankDeck())).toBe(`/flashcards/${DECK}`);
    expect(client.calls).toContainEqual({
      op: "insert",
      args: [
        {
          title: "Untitled deck",
          description: "",
          classroom_id: null,
          is_shared: false,
        },
      ],
    });
  });

  it("says so when the insert fails", async () => {
    client = makeClient({
      data: null,
      error: { code: "42501", message: "denied" },
    });
    expect((await createBlankDeck()).error).toBe("That didn't save. Try again.");
  });
});
