import { beforeEach, describe, expect, it, vi } from "vitest";
import { makeClient } from "@/test/chain-client";

// Taking a warning back (0290) against a stand-in database: what reaches remove_warning and what the executive reads.

let client = makeClient({ data: null, error: null });
const refresh = vi.fn();
const requireRole = vi.fn(async () => ({ id: "11111111-1111-4111-8111-111111111111", role: "executive" }));

vi.mock("@/lib/supabase/server", () => ({ createClient: async () => client }));
vi.mock("next/cache", () => ({ refresh: () => refresh() }));
vi.mock("@/lib/auth", () => ({ requireRole: () => requireRole() }));

const { removeWarning } = await import("./moderation-actions");

const WARNING = "55555555-5555-4555-8555-555555555555";
const form = (id: string) => {
  const f = new FormData();
  f.set("warningId", id);
  return f;
};

beforeEach(() => {
  client = makeClient({ data: null, error: null });
  refresh.mockClear();
  requireRole.mockClear();
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("removeWarning", () => {
  it("is for executives, sends the warning and refreshes", async () => {
    expect(await removeWarning({}, form(WARNING))).toEqual({ ok: "Warning removed." });
    expect(requireRole).toHaveBeenCalledTimes(1);
    expect(client.rpc).toHaveBeenCalledWith("remove_warning", { p_id: WARNING });
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it("refuses a bad id before the database", async () => {
    expect(await removeWarning({}, form("nope"))).toEqual({
      error: "That warning is already gone. Reload the page.",
    });
    expect(client.rpc).not.toHaveBeenCalled();
  });

  it("shows the database's own sentence", async () => {
    client = makeClient({ data: null, error: { code: "P0001", message: "You can't remove a warning on your own account." } });
    expect(await removeWarning({}, form(WARNING))).toEqual({
      error: "You can't remove a warning on your own account.",
    });
    expect(refresh).not.toHaveBeenCalled();
  });

  it("says when the database doesn't have it yet", async () => {
    client = makeClient({ data: null, error: { code: "PGRST202", message: "Could not find the function" } });
    expect(await removeWarning({}, form(WARNING))).toEqual({
      error: "This needs the latest database update. Ask the developer to apply it.",
    });
  });
});
