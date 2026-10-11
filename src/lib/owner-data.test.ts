import { beforeEach, describe, expect, it, vi } from "vitest";
import { makeClient, type Result } from "@/test/chain-client";

// The owner console's server reads (0232) against a stand-in Supabase client: what each read asks the database for,
// and how a refusal or a missing function comes back to the page.

let client = makeClient({ data: [], error: null });

vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => client }));

const { loadAudit } = await import("./owner-data");

const row = (id: number) => ({
  id,
  created_at: "2026-10-11T12:00:00Z",
  actor_name: "Sample Exec",
  action: "role",
  target_name: "Sample Member",
  detail: "trainee to trainer",
});
const rows = (n: number, from = 1) =>
  Array.from({ length: n }, (_, i) => row(from + i));
const answer = (r: Result) => {
  client = makeClient(r);
};

beforeEach(() => {
  answer({ data: [], error: null });
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("loadAudit", () => {
  it("asks for one row past the page, and shows the page without it", async () => {
    answer({ data: rows(51, 101), error: null });
    const result = await loadAudit("role", 2);
    expect(client.rpc).toHaveBeenCalledWith("owner_audit", {
      p_q: "role",
      p_limit: 51,
      p_offset: 100,
    });
    expect(result).toEqual({
      ok: true,
      data: { rows: rows(50, 101), hasMore: true },
    });
  });

  it("has no older page when exactly a page came back", async () => {
    answer({ data: rows(50), error: null });
    expect(await loadAudit("", 0)).toEqual({
      ok: true,
      data: { rows: rows(50), hasMore: false },
    });
  });

  it("passes a refusal and a missing function through", async () => {
    answer({
      data: null,
      error: { code: "42501", message: "Only executives" },
    });
    expect(await loadAudit("", 0)).toEqual({ ok: false, reason: "denied" });
    answer({ data: null, error: { code: "PGRST202", message: "missing" } });
    expect(await loadAudit("", 0)).toEqual({ ok: false, reason: "missing" });
    answer({ data: null, error: { code: "XX000", message: "boom" } });
    expect(await loadAudit("", 0)).toEqual({ ok: false, reason: "failed" });
  });
});
