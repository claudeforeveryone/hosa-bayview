import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const db = vi.hoisted(() => ({ rpc: vi.fn() }));
const createClient = vi.hoisted(() => vi.fn(() => db));
vi.mock("@supabase/supabase-js", () => ({ createClient }));

import { supabaseOutbox } from "./outbox";

const SECRET = "s".repeat(43);

describe("supabaseOutbox", () => {
  beforeEach(() => {
    db.rpc.mockReset();
    createClient.mockClear();
  });

  it("uses the publishable key with no session: the secret, not a service key, is the gate", () => {
    supabaseOutbox(SECRET);
    const [, key, options] = createClient.mock.calls[0] as unknown as [
      string,
      string,
      { auth: { persistSession: boolean } },
    ];
    expect(key).toBe(process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY);
    expect(options.auth.persistSession).toBe(false);
  });

  it("claims a batch with the secret", async () => {
    db.rpc.mockResolvedValueOnce({
      data: [{ notification_id: "n1" }],
      error: null,
    });
    const rows = await supabaseOutbox(SECRET).claim(50);
    expect(db.rpc).toHaveBeenCalledWith("push_claim", {
      p_secret: SECRET,
      p_limit: 50,
    });
    expect(rows).toEqual([{ notification_id: "n1" }]);
  });

  it("reports outcomes with the secret", async () => {
    db.rpc.mockResolvedValueOnce({ data: null, error: null });
    await supabaseOutbox(SECRET).report({
      done: ["n1"],
      ok: ["a"],
      failed: ["b"],
      gone: ["c"],
    });
    expect(db.rpc).toHaveBeenCalledWith("push_report", {
      p_secret: SECRET,
      p_done: ["n1"],
      p_ok: ["a"],
      p_failed: ["b"],
      p_gone: ["c"],
    });
  });

  it("throws on a database error so the route fails and the lease retries the rows", async () => {
    db.rpc.mockResolvedValue({
      data: null,
      error: { code: "42501", message: "Not allowed" },
    });
    await expect(supabaseOutbox(SECRET).claim(50)).rejects.toThrow("42501");
    await expect(
      supabaseOutbox(SECRET).report({ done: [], ok: [], failed: [], gone: [] }),
    ).rejects.toThrow("42501");
  });
});
