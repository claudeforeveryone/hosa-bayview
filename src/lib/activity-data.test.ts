import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("react", async (orig) => ({
  ...(await orig<typeof import("react")>()),
  cache: <T>(fn: T) => fn,
}));

type Pending = { resolve: (v: unknown) => void };
const calls: string[] = [];
const pending: Record<string, Pending> = {};
const rpc = vi.fn(
  (name: string) =>
    new Promise((resolve) => {
      calls.push(name);
      pending[name] = { resolve };
    }),
);
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({ rpc }),
}));
vi.mock("@/lib/avatar-urls", () => ({
  avatarSources: async () => new Map([["u1.png", "https://signed/u1"]]),
}));

const { getBoard } = await import("./activity-data");

const flush = () => new Promise((r) => setTimeout(r, 0));
const row = {
  user_id: "u1",
  full_name: "Ann",
  minutes: 1,
  reviews: 0,
  answered: 0,
  correct: 0,
  accuracy: null,
  elo: 1000,
  gain: 0,
  streak: 0,
};

describe("getBoard", () => {
  it("asks for pictures alongside the board, not after it", async () => {
    calls.length = 0;
    const board = getBoard("week", null);
    await flush();
    // Both requests are out before either has answered.
    expect(calls.sort()).toEqual(["leaderboard", "member_details"]);
    pending.member_details.resolve({
      data: [{ user_id: "u1", avatar_path: "u1.png", grade: 11 }],
      error: null,
    });
    pending.leaderboard.resolve({ data: [row], error: null });
    const rows = await board;
    expect(rows[0].avatar_url).toBe("https://signed/u1");
  });

  it("reads a room you can't view as an empty board", async () => {
    const board = getBoard("week", "00000000-0000-4000-8000-000000000000");
    await flush();
    pending.leaderboard.resolve({
      data: null,
      error: { code: "42501", message: "no" },
    });
    pending.member_details.resolve({ data: [], error: null });
    expect(await board).toEqual([]);
  });
});
