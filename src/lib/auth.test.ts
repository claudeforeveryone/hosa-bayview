import { AuthRetryableFetchError } from "@supabase/supabase-js";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { mockSupabase } from "@/test/supabase-mock";

vi.mock("server-only", () => ({}));
let client = mockSupabase();
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => client }));
vi.mock("next/navigation", () => ({
  redirect: (to: string) => {
    throw Object.assign(new Error("NEXT_REDIRECT"), { to });
  },
}));

// react's cache() memoises per request; in tests each call should hit the mock fresh.
vi.mock("react", async (orig) => ({ ...(await orig<typeof import("react")>()), cache: <T,>(fn: T) => fn }));

const { getProfile, getUserId, requireProfile, requireRole } = await import("./auth");

const profile = { id: "u1", email: "a@b.co", full_name: "Ann", role: "trainee", created_at: "2026-01-01" };
const redirectOf = async (p: Promise<unknown>) => {
  try {
    await p;
  } catch (e) {
    return (e as { to?: string }).to;
  }
  return undefined;
};

beforeEach(() => {
  client = mockSupabase();
});

describe("lib/auth", () => {
  it("returns the profile for a signed-in user", async () => {
    client = mockSupabase({ userId: "u1", profile });
    expect(await getProfile()).toEqual(profile);
    expect(await requireProfile()).toEqual(profile);
  });

  it("sends guests to login", async () => {
    client = mockSupabase({ userId: null });
    expect(await getProfile()).toBeNull();
    expect(await redirectOf(requireProfile())).toBe("/login");
  });

  it("clears a session whose profile is gone instead of looping", async () => {
    client = mockSupabase({ userId: "u1", profile: null });
    expect(await redirectOf(requireProfile())).toBe("/auth/signout");
  });

  it("treats a failed profile lookup as an outage, not a missing account", async () => {
    client = mockSupabase({ userId: "u1", profileError: { message: "timeout" } });
    await expect(requireProfile()).rejects.toThrow(/Profile lookup failed/);
  });

  it("treats an unreachable auth server as an outage, not signed out", async () => {
    client = mockSupabase({ userId: null, claimsError: new AuthRetryableFetchError("fetch failed", 0) });
    await expect(requireProfile()).rejects.toThrow(/unreachable/);
  });

  it("getUserId gives the signed-in id without the profile, null for guests", async () => {
    client = mockSupabase({ userId: "u1", profile });
    expect(await getUserId()).toBe("u1");
    expect(client.from).not.toHaveBeenCalled();
    client = mockSupabase();
    expect(await getUserId()).toBeNull();
  });

  it("getUserId treats an unreachable auth server as an outage", async () => {
    client = mockSupabase({ userId: null, claimsError: new AuthRetryableFetchError("fetch failed", 0) });
    await expect(getUserId()).rejects.toThrow(/unreachable/);
  });

  it("requireRole lets matching roles through and sends others home", async () => {
    client = mockSupabase({ userId: "u1", profile });
    expect(await requireRole("trainee", "trainer")).toEqual(profile);
    expect(await redirectOf(requireRole("executive"))).toBe("/");
  });
});
