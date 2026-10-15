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

const { getBoard, getMemberDetail } = await import("./activity-data");

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
    expect(calls.sort()).toEqual(["board_tags", "leaderboard", "member_details"]);
    pending.member_details.resolve({
      data: [{ user_id: "u1", avatar_path: "u1.png", grade: 11 }],
      error: null,
    });
    pending.board_tags.resolve({
      data: [{ user_id: "u1", kind: "trainer", flair: "Med Term" }],
      error: null,
    });
    pending.leaderboard.resolve({ data: [row], error: null });
    const rows = await board;
    expect(rows[0].avatar_url).toBe("https://signed/u1");
    expect(rows[0].kind).toBe("trainer");
    expect(rows[0].flair).toBe("Med Term");
  });

  it("shows plain names before 0294 is in the database", async () => {
    const board = getBoard("all", null);
    await flush();
    pending.member_details.resolve({ data: [], error: null });
    pending.board_tags.resolve({ data: null, error: { code: "PGRST202", message: "missing" } });
    pending.leaderboard.resolve({ data: [row], error: null });
    const rows = await board;
    expect(rows[0].kind).toBe("member");
    expect(rows[0].flair).toBeNull();
  });

  it("reads a room you can't view as an empty board", async () => {
    const board = getBoard("week", "00000000-0000-4000-8000-000000000000");
    await flush();
    pending.leaderboard.resolve({
      data: null,
      error: { code: "42501", message: "no" },
    });
    pending.member_details.resolve({ data: [], error: null });
    pending.board_tags.resolve({ data: [], error: null });
    expect(await board).toEqual([]);
  });
});

describe("getMemberDetail", () => {
  const id = "00000000-0000-4000-8000-000000000001";

  it("reads one member's picture, grade and title from member_detail", async () => {
    calls.length = 0;
    const detail = getMemberDetail(id);
    await flush();
    expect(calls).toEqual(["member_detail"]);
    expect(rpc).toHaveBeenLastCalledWith("member_detail", { uid: id });
    pending.member_detail.resolve({
      data: [{ user_id: id, avatar_path: "u1.png", grade: 11, title: "President" }],
      error: null,
    });
    expect(await detail).toEqual({
      user_id: id,
      avatar_url: "https://signed/u1",
      grade: 11,
      title: "President",
    });
  });

  it("falls back to the member list while member_detail isn't in the database yet", async () => {
    calls.length = 0;
    const detail = getMemberDetail(id);
    await flush();
    pending.member_detail.resolve({
      data: null,
      error: { code: "PGRST202", message: "Could not find the function" },
    });
    await flush();
    expect(calls).toEqual(["member_detail", "member_details"]);
    pending.member_details.resolve({
      data: [{ user_id: id, avatar_path: null, grade: 10, title: null }],
      error: null,
    });
    expect(await detail).toEqual({ user_id: id, avatar_url: null, grade: 10, title: null });
  });

  it("is null for a bad id or another error, without asking twice", async () => {
    calls.length = 0;
    expect(await getMemberDetail("not-a-uuid")).toBeNull();
    expect(calls).toEqual([]);
    const detail = getMemberDetail(id);
    await flush();
    pending.member_detail.resolve({ data: null, error: { code: "42501", message: "no" } });
    expect(await detail).toBeNull();
    expect(calls).toEqual(["member_detail"]);
  });
});
