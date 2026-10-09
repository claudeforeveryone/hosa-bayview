import { beforeEach, describe, expect, it, vi } from "vitest";
import { mockSupabase } from "@/test/supabase-mock";

let client = mockSupabase();
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => client }));
vi.mock("next/headers", () => ({ headers: async () => new Headers({ origin: "null" }) }));
vi.mock("next/navigation", () => ({
  redirect: (to: string) => {
    throw Object.assign(new Error("NEXT_REDIRECT"), { to });
  },
}));

const { login, signup, claimAdmin, requestReset, updatePassword, logout } = await import("./actions");

const form = (fields: Record<string, string>) => {
  const f = new FormData();
  for (const [k, v] of Object.entries(fields)) f.set(k, v);
  return f;
};
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
  vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://hosa.example/");
});

describe("login", () => {
  it("redirects to a safe next after success", async () => {
    expect(await redirectOf(login({}, form({ email: "A@B.co", password: "x", next: "/profile" })))).toBe("/profile");
    expect(client.auth.signInWithPassword).toHaveBeenCalledWith({ email: "a@b.co", password: "x" });
  });

  it("refuses off-site next values", async () => {
    expect(await redirectOf(login({}, form({ email: "a@b.co", password: "x", next: "/..//evil.com" })))).toBe("/");
  });

  it("explains bad credentials and keeps the email", async () => {
    client = mockSupabase({ authError: { message: "Invalid login credentials" } });
    const state = await login({}, form({ email: "a@b.co", password: "x" }));
    expect(state.error).toBe("That email and password don't match.");
    expect(state.values?.email).toBe("a@b.co");
  });
});

describe("signup", () => {
  it("rejects passwords over 72 bytes even when under 72 characters", async () => {
    const state = await signup({}, form({ full_name: "Sam", email: "s@b.co", password: "é".repeat(40) }));
    expect(state.fieldErrors?.password).toBeTruthy();
    expect(client.auth.signUp).not.toHaveBeenCalled();
  });

  it("goes home when the account is ready right away", async () => {
    expect(await redirectOf(signup({}, form({ full_name: "Sam", email: "s@b.co", password: "longenough" })))).toBe("/");
  });

  it("asks to confirm by email when there's no session yet", async () => {
    client = mockSupabase({ session: null });
    const state = await signup({}, form({ full_name: "Sam", email: "s@b.co", password: "longenough" }));
    expect(state.ok).toMatch(/Check your email/);
  });

  it("uses the configured site URL for email links", async () => {
    await redirectOf(signup({}, form({ full_name: "Sam", email: "s@b.co", password: "longenough" })));
    expect(client.auth.signUp).toHaveBeenCalledWith(
      expect.objectContaining({
        options: expect.objectContaining({ emailRedirectTo: "https://hosa.example/auth/callback" }),
      }),
    );
  });
});

describe("admin passcode", () => {
  const withRpc = (result: { data: unknown; error: unknown }) => {
    const rpc = vi.fn(async () => result);
    Object.assign(client, { rpc });
    return rpc;
  };
  const fields = { full_name: "Sam", email: "s@b.co", password: "longenough" };

  it("makes an admin when the passcode is right", async () => {
    const rpc = withRpc({ data: true, error: null });
    expect(await redirectOf(signup({}, form({ ...fields, passcode: "chapter-code" })))).toBe("/");
    expect(rpc).toHaveBeenCalledWith("claim_admin", { code: "chapter-code" });
  });

  it("keeps the account and says so when the passcode is wrong", async () => {
    withRpc({ data: false, error: null });
    expect(await redirectOf(signup({}, form({ ...fields, passcode: "nope" })))).toBe("/settings?passcode=wrong");
  });

  it("won't make a member account when admin mode has no passcode", async () => {
    const state = await signup({}, form({ ...fields, admin: "1" }));
    expect(state.fieldErrors?.passcode).toBe("Enter the admin passcode.");
    expect(client.auth.signUp).not.toHaveBeenCalled();
  });

  it("tells email-confirm sign-ups where to enter the passcode", async () => {
    client = mockSupabase({ session: null });
    const state = await signup({}, form({ ...fields, admin: "1", passcode: "chapter-code" }));
    expect(state.ok).toMatch(/passcode in Settings/);
  });

  it("separates a throttled or failed claim from a wrong passcode", async () => {
    withRpc({ data: null, error: { code: "54000", message: "Too many" } });
    expect(await redirectOf(signup({}, form({ ...fields, passcode: "x-code" })))).toBe("/settings?passcode=slow");
    withRpc({ data: null, error: { code: "XX000", message: "boom" } });
    vi.spyOn(console, "error").mockImplementation(() => {});
    expect(await redirectOf(signup({}, form({ ...fields, passcode: "x-code" })))).toBe("/settings?passcode=retry");
  });

  it("skips the check for a normal sign-up", async () => {
    const rpc = withRpc({ data: true, error: null });
    await redirectOf(signup({}, form(fields)));
    expect(rpc).not.toHaveBeenCalled();
  });

  it("explains a wrong or throttled passcode in settings", async () => {
    withRpc({ data: false, error: null });
    expect((await claimAdmin({}, form({ passcode: "nope" }))).fieldErrors?.passcode).toBe("That passcode isn't right.");
    withRpc({ data: null, error: { code: "54000", message: "Too many" } });
    expect((await claimAdmin({}, form({ passcode: "nope" }))).fieldErrors?.passcode).toMatch(/Too many/);
    withRpc({ data: true, error: null });
    expect(await redirectOf(claimAdmin({}, form({ passcode: "chapter-code" })))).toBe("/admin");
  });
});

describe("requestReset", () => {
  it("gives the same answer whether or not the account exists", async () => {
    const state = await requestReset({}, form({ email: "nobody@b.co" }));
    expect(state.ok).toMatch(/If that email has an account/);
    expect(client.auth.resetPasswordForEmail).toHaveBeenCalledWith("nobody@b.co", {
      redirectTo: "https://hosa.example/auth/callback?next=/reset-password",
    });
  });
});

describe("logout", () => {
  it("signs out this device only and goes to login", async () => {
    expect(await redirectOf(logout())).toBe("/login");
    expect(client.auth.signOut).toHaveBeenCalledWith({ scope: "local" });
  });
});

describe("requestReset errors", () => {
  it("logs mail failures but tells the user the same thing", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    client = mockSupabase({ authError: { message: "Error sending recovery email" } });
    const state = await requestReset({}, form({ email: "a@b.co" }));
    expect(state.ok).toMatch(/If that email has an account/);
    expect(log).toHaveBeenCalled();
    log.mockRestore();
  });
});

describe("updatePassword", () => {
  it("saves and signs out other devices", async () => {
    expect(await redirectOf(updatePassword({}, form({ password: "longenough", confirm: "longenough" })))).toBe("/");
    expect(client.auth.updateUser).toHaveBeenCalledWith({ password: "longenough" });
    expect(client.auth.signOut).toHaveBeenCalledWith({ scope: "others" });
  });

  it("requires both fields to match", async () => {
    const state = await updatePassword({}, form({ password: "longenough", confirm: "different1" }));
    expect(state.fieldErrors?.confirm).toBe("Passwords don't match.");
    expect(client.auth.updateUser).not.toHaveBeenCalled();
  });
});
