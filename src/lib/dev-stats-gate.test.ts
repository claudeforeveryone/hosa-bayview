import { beforeEach, describe, expect, it, vi } from "vitest";

// canSeeDevStats, the check the /developer page, the layout's nav link and /more share: only a literal true from
// can_see_dev_stats() opens the console. A string, a number or an error is a no.
let reply: { data: unknown; error: { code: string; message: string } | null } =
  { data: null, error: null };

vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({ rpc: async () => reply }),
}));

const { canSeeDevStats } = await import("./dev-stats-data");

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
