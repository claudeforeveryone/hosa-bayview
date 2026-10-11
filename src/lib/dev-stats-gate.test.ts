import { beforeEach, describe, expect, it, vi } from "vitest";

// canSeeDevStats, the check the /developer page, the layout's nav link and /more share: only a literal true from
// can_see_dev_stats() opens the console. A string, a number or an error is a no.
let reply: { data: unknown; error: { code: string; message: string } | null } =
  { data: null, error: null };

vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({ rpc: async () => reply }),
}));

const { canSeeDevStats, getDevStats } = await import("./dev-stats-data");

beforeEach(() => {
  reply = { data: null, error: null };
});

describe("canSeeDevStats", () => {
  it("opens for a literal true", async () => {
    reply = { data: true, error: null };
    expect(await canSeeDevStats()).toBe(true);
  });

  it("stays shut for anything else", async () => {
    for (const data of ["true", 1, null, { ok: true }, false]) {
      reply = { data, error: null };
      expect(await canSeeDevStats()).toBe(false);
    }
  });

  it("stays shut when the check fails or isn't on the database", async () => {
    const quiet = vi.spyOn(console, "error").mockImplementation(() => {});
    reply = { data: true, error: { code: "PGRST202", message: "missing" } };
    expect(await canSeeDevStats()).toBe(false);
    reply = { data: true, error: { code: "57014", message: "timeout" } };
    expect(await canSeeDevStats()).toBe(false);
    expect(quiet).toHaveBeenCalledTimes(1);
    quiet.mockRestore();
  });
});

// The Members tab's read (0105's dev_member_stats). A refusal, a missing function and any other failure are three
// different answers: only the refusal is the not-found page, the others keep the console with a note.
describe("getDevStats", () => {
  it("says denied for a refusal, quietly", async () => {
    const quiet = vi.spyOn(console, "error").mockImplementation(() => {});
    reply = { data: null, error: { code: "42501", message: "nope" } };
    expect(await getDevStats("all")).toEqual({ ok: false, reason: "denied" });
    expect(quiet).not.toHaveBeenCalled();
    quiet.mockRestore();
  });

  it("says missing when the function isn't on the database", async () => {
    for (const code of ["PGRST202", "42883"]) {
      reply = { data: null, error: { code, message: "missing" } };
      expect(await getDevStats("all")).toEqual({
        ok: false,
        reason: "missing",
      });
    }
  });

  it("says failed for anything else, and logs it once", async () => {
    const quiet = vi.spyOn(console, "error").mockImplementation(() => {});
    reply = { data: null, error: { code: "57014", message: "timeout" } };
    expect(await getDevStats("week")).toEqual({ ok: false, reason: "failed" });
    expect(quiet).toHaveBeenCalledTimes(1);
    quiet.mockRestore();
  });

  it("turns the database's numeric strings into numbers", async () => {
    reply = {
      data: [
        {
          user_id: "u1",
          full_name: "Sample Member",
          banned: null,
          seen_today: true,
          seen_week: null,
          minutes_all: "125",
          minutes_7d: 30,
          minutes_today: "0",
          minutes_period: "125",
          clicks_all: "40",
          clicks_7d: "4",
          clicks_today: 0,
          clicks_period: "40",
          answered: "300",
          correct: "210",
          attempts: "12",
          finished: "10",
          reviews: "3",
          battle_wins: "0",
          classrooms: "2",
          elo: "1180",
          elo_gain: "-12",
        },
      ],
      error: null,
    };
    const r = await getDevStats("all");
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.data).toHaveLength(1);
    expect(r.data[0]).toMatchObject({
      banned: false,
      seen_today: true,
      seen_week: false,
      minutes_all: 125,
      minutes_7d: 30,
      answered: 300,
      elo: 1180,
      elo_gain: -12,
    });
  });

  it("reads no rows as an empty table, not a failure", async () => {
    reply = { data: null, error: null };
    expect(await getDevStats("today")).toEqual({ ok: true, data: [] });
  });
});
