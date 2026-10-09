import { beforeEach, describe, expect, it, vi } from "vitest";
import { makeClient } from "@/test/chain-client";

let client = makeClient({ data: null, error: null });
const refresh = vi.fn();
const requireRole = vi.fn(async () => ({ id: "11111111-1111-4111-8111-111111111111", role: "executive" }));

vi.mock("@/lib/supabase/server", () => ({ createClient: async () => client }));
vi.mock("next/cache", () => ({ refresh: () => refresh() }));
vi.mock("@/lib/auth", () => ({ requireRole: () => requireRole() }));

const { setRole } = await import("./actions");

const USER = "33333333-3333-4333-8333-333333333333";
const form = (role: string) => {
  const f = new FormData();
  f.set("role", role);
  return f;
};

beforeEach(() => {
  client = makeClient({ data: [{ id: USER }], error: null });
  refresh.mockClear();
  requireRole.mockClear();
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("setRole", () => {
  it("is for executives only", async () => {
    await setRole(USER, {}, form("trainer"));
    expect(requireRole).toHaveBeenCalled();
  });

  it("updates the role and refreshes", async () => {
    expect(await setRole(USER, {}, form("trainer"))).toEqual({});
    expect(client.calls).toContainEqual({ op: "update", args: [{ role: "trainer" }] });
    expect(refresh).toHaveBeenCalled();
  });

  it("rejects unknown roles and malformed ids without touching the database", async () => {
    expect((await setRole(USER, {}, form("owner"))).error).toBe("Pick a role.");
    expect((await setRole("nope", {}, form("trainer"))).error).toBe("Pick a role.");
    expect(client.from).not.toHaveBeenCalled();
  });

  it("explains the last-executive rule", async () => {
    client = makeClient({ data: null, error: { code: "P0001", message: "There must be at least one executive" } });
    expect((await setRole(USER, {}, form("trainee"))).error).toBe("There has to be at least one executive.");
  });

  it("says so when the person is gone", async () => {
    client = makeClient({ data: [], error: null });
    expect((await setRole(USER, {}, form("trainee"))).error).toMatch(/gone/);
    expect(refresh).not.toHaveBeenCalled();
  });
});
