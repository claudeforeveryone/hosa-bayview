import { beforeEach, describe, expect, it, vi } from "vitest";
import { makeClient } from "@/test/chain-client";

let client = makeClient({ data: null, error: null });
const refresh = vi.fn();
const requireRole = vi.fn(async () => ({ id: "11111111-1111-4111-8111-111111111111", role: "executive" }));

vi.mock("@/lib/supabase/server", () => ({ createClient: async () => client }));
vi.mock("next/cache", () => ({ refresh: () => refresh() }));
vi.mock("@/lib/auth", () => ({ requireRole: () => requireRole() }));

const { setRole, setChapterCode, clearChapterCode } = await import("./actions");

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

describe("chapter code", () => {
  const codeForm = (code: string) => {
    const f = new FormData();
    f.set("chapter_code", code);
    return f;
  };

  it("sets a trimmed code through the RPC and refreshes", async () => {
    client = makeClient({ data: null, error: null });
    expect(await setChapterCode({}, codeForm("  tigers-2026 "))).toEqual({ ok: "Chapter code set." });
    expect(requireRole).toHaveBeenCalled();
    expect(client.calls).toContainEqual({ op: "rpc", args: ["set_chapter_passcode", { code: "tigers-2026" }] });
    expect(refresh).toHaveBeenCalled();
  });

  it("needs 6 to 72 characters before calling the database", async () => {
    expect((await setChapterCode({}, codeForm("five5"))).codeError).toBe("Use at least 6 characters.");
    expect((await setChapterCode({}, codeForm("x".repeat(73)))).codeError).toBe("Keep it under 72 characters.");
    expect(client.rpc).not.toHaveBeenCalled();
  });

  it("explains a refusal and a missing migration", async () => {
    client = makeClient({ data: null, error: { code: "42501", message: "Only executives" } });
    expect((await setChapterCode({}, codeForm("tigers-2026"))).error).toBe("Only executives can change the chapter code.");
    expect((await clearChapterCode()).error).toBe("Only executives can change the chapter code.");
    client = makeClient({ data: null, error: { code: "PGRST202", message: "missing" } });
    expect((await setChapterCode({}, codeForm("tigers-2026"))).error).toBe("The chapter code isn't set up yet.");
    expect(refresh).not.toHaveBeenCalled();
  });

  it("clears through the RPC", async () => {
    client = makeClient({ data: null, error: null });
    expect(await clearChapterCode()).toEqual({ ok: "Chapter code cleared." });
    expect(client.calls).toContainEqual({ op: "rpc", args: ["clear_chapter_passcode", undefined] });
    expect(refresh).toHaveBeenCalled();
  });
});
