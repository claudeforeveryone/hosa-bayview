import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { mockSupabase } from "@/test/supabase-mock";

let client = mockSupabase();
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => client }));

const { GET: callback } = await import("./callback/route");
const { GET: signout } = await import("./signout/route");
const { GET: confirm } = await import("./confirm/route");

const req = (path: string) => new NextRequest(`http://localhost:3000${path}`);
const location = (res: Response) => res.headers.get("location");

describe("/auth/callback", () => {
  beforeEach(() => {
    client = mockSupabase();
  });

  it("exchanges the code and follows a safe next", async () => {
    const res = await callback(req("/auth/callback?code=abc&next=/reset-password"));
    expect(client.auth.exchangeCodeForSession).toHaveBeenCalledWith("abc");
    expect(location(res)).toBe("http://localhost:3000/reset-password");
  });

  it("never redirects off-site", async () => {
    for (const next of ["//evil.com", "/..//evil.com", "/%09/evil.com", "https://evil.com"]) {
      const res = await callback(req(`/auth/callback?code=abc&next=${encodeURIComponent(next)}`));
      expect(new URL(location(res)!).origin).toBe("http://localhost:3000");
    }
  });

  it("refuses token-hash links, which aren't tied to this browser", async () => {
    const res = await callback(req("/auth/callback?token_hash=h&type=recovery&next=/reset-password"));
    expect(client.auth.verifyOtp).not.toHaveBeenCalled();
    expect(location(res)).toBe("http://localhost:3000/login?link=expired");
  });

  it("sends expired or missing links to login", async () => {
    client = mockSupabase({ authError: { message: "expired" } });
    expect(location(await callback(req("/auth/callback?code=bad")))).toBe("http://localhost:3000/login?link=expired");
    expect(location(await callback(req("/auth/callback")))).toBe("http://localhost:3000/login?link=expired");
  });
});

describe("/auth/confirm", () => {
  beforeEach(() => {
    client = mockSupabase();
  });

  it("verifies a recovery token and opens the new-password form", async () => {
    const res = await confirm(req("/auth/confirm?token_hash=h&type=recovery&next=//evil.com"));
    expect(client.auth.verifyOtp).toHaveBeenCalledWith({ type: "recovery", token_hash: "h" });
    expect(location(res)).toBe("http://localhost:3000/reset-password");
  });

  it("refuses other link types and missing tokens", async () => {
    expect(location(await confirm(req("/auth/confirm?token_hash=h&type=magiclink")))).toBe("http://localhost:3000/login?link=expired");
    expect(location(await confirm(req("/auth/confirm?type=recovery")))).toBe("http://localhost:3000/login?link=expired");
    expect(client.auth.verifyOtp).not.toHaveBeenCalled();
  });

  it("sends expired links to login", async () => {
    client = mockSupabase({ authError: { message: "expired" } });
    expect(location(await confirm(req("/auth/confirm?token_hash=h&type=recovery")))).toBe("http://localhost:3000/login?link=expired");
  });
});

describe("/auth/signout", () => {
  it("signs out only when the profile is truly gone", async () => {
    client = mockSupabase({ userId: "u1", profile: null });
    const res = await signout(req("/auth/signout"));
    expect(client.auth.signOut).toHaveBeenCalledWith({ scope: "local" });
    expect(location(res)).toBe("http://localhost:3000/login?account=missing");
  });

  it("leaves a session with a profile alone", async () => {
    client = mockSupabase({ userId: "u1", profile: { id: "u1" } });
    const res = await signout(req("/auth/signout"));
    expect(client.auth.signOut).not.toHaveBeenCalled();
    expect(location(res)).toBe("http://localhost:3000/");
  });

  it("does not sign out when the lookup fails", async () => {
    client = mockSupabase({ userId: "u1", profileError: { message: "timeout" } });
    await signout(req("/auth/signout"));
    expect(client.auth.signOut).not.toHaveBeenCalled();
  });

  it("sends guests to login", async () => {
    client = mockSupabase({ userId: null });
    expect(location(await signout(req("/auth/signout")))).toBe("http://localhost:3000/login");
  });
});
