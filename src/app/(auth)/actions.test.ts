import { beforeEach, describe, expect, it, vi } from "vitest";
import { mockSupabase } from "@/test/supabase-mock";

// The push sign-out helpers are server-only; tests run them directly.
vi.mock("server-only", () => ({}));

let client = mockSupabase();
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => client }));
// The code check runs with the secret key; the same mock answers it. Null: the key isn't set.
let adminClient: (() => typeof client) | null = () => client;
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => {
    if (!adminClient) throw new Error("SUPABASE_SECRET_KEY is not set");
    return adminClient();
  },
}));
// A tiny cookie jar, so the "Stay signed in" choice can be read back.
const jar = new Map<
  string,
  { value: string; options?: Record<string, unknown> }
>();
let requestHeaders = new Headers({ origin: "null" });
vi.mock("next/headers", () => ({
  headers: async () => requestHeaders,
  cookies: async () => ({
    get: (name: string) => {
      const c = jar.get(name);
      return c ? { name, value: c.value } : undefined;
    },
    set: (name: string, value: string, options?: Record<string, unknown>) =>
      jar.set(name, { value, options }),
    delete: (name: string) => jar.delete(name),
  }),
}));
vi.mock("next/navigation", () => ({
  redirect: (to: string) => {
    throw Object.assign(new Error("NEXT_REDIRECT"), { to });
  },
}));

const { login, signup, claimAdmin, requestReset, updatePassword, logout } =
  await import("./actions");

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
  adminClient = () => client;
  requestHeaders = new Headers({ origin: "null" });
  vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://hosa.example/");
});

describe("login", () => {
  it("redirects to a safe next after success", async () => {
    expect(
      await redirectOf(
        login({}, form({ email: "A@B.co", password: "x", next: "/profile" })),
      ),
    ).toBe("/profile");
    expect(client.auth.signInWithPassword).toHaveBeenCalledWith({
      email: "a@b.co",
      password: "x",
    });
  });

  it("refuses off-site next values", async () => {
    expect(
      await redirectOf(
        login(
          {},
          form({ email: "a@b.co", password: "x", next: "/..//evil.com" }),
        ),
      ),
    ).toBe("/");
  });

  it("tells someone typing an old username to use their email", async () => {
    const state = await login({}, form({ email: "KadenLi", password: "x" }));
    expect(state.fieldErrors?.email).toMatch(/email you signed up with/);
    expect(client.auth.signInWithPassword).not.toHaveBeenCalled();
  });

  it("explains bad credentials and keeps the email", async () => {
    client = mockSupabase({
      authError: { message: "Invalid login credentials" },
    });
    const state = await login({}, form({ email: "a@b.co", password: "x" }));
    expect(state.error).toBe("That email and password don't match.");
    expect(state.values?.email).toBe("a@b.co");
  });

  it("stay signed in off: marks the session short, with no expiry of its own", async () => {
    jar.clear();
    await redirectOf(login({}, form({ email: "a@b.co", password: "x" })));
    const marker = jar.get("hosa-short-session");
    expect(marker?.value).toBe("1");
    expect(marker?.options?.maxAge).toBeUndefined();
    expect(marker?.options?.expires).toBeUndefined();
  });

  it("stay signed in on: clears any short-session marker and keeps the choice after a failed try", async () => {
    jar.set("hosa-short-session", { value: "1" });
    await redirectOf(
      login({}, form({ email: "a@b.co", password: "x", remember: "on" })),
    );
    expect(jar.has("hosa-short-session")).toBe(false);
    client = mockSupabase({
      authError: { message: "Invalid login credentials" },
    });
    const state = await login(
      {},
      form({ email: "a@b.co", password: "x", remember: "on" }),
    );
    expect(state.values?.remember).toBe("on");
  });
});

describe("signup", () => {
  it("rejects passwords over 72 bytes even when under 72 characters", async () => {
    const state = await signup(
      {},
      form({ full_name: "Sam", email: "s@b.co", password: "é".repeat(40) }),
    );
    expect(state.fieldErrors?.password).toBeTruthy();
    expect(client.auth.signUp).not.toHaveBeenCalled();
  });

  it("goes home when the account is ready right away", async () => {
    expect(
      await redirectOf(
        signup(
          {},
          form({ full_name: "Sam", email: "s@b.co", password: "longenough" }),
        ),
      ),
    ).toBe("/");
  });

  it("asks to confirm by email when there's no session yet", async () => {
    client = mockSupabase({ session: null });
    const state = await signup(
      {},
      form({ full_name: "Sam", email: "s@b.co", password: "longenough" }),
    );
    expect(state.ok).toMatch(/Check your email/);
  });

  it("uses the configured site URL for email links", async () => {
    await redirectOf(
      signup(
        {},
        form({ full_name: "Sam", email: "s@b.co", password: "longenough" }),
      ),
    );
    expect(client.auth.signUp).toHaveBeenCalledWith(
      expect.objectContaining({
        options: expect.objectContaining({
          emailRedirectTo: "https://hosa.example/auth/callback",
        }),
      }),
    );
  });
});

describe("admin passcode", () => {
  // Only claim_admin answers; the chapter code RPCs are missing, so there's no gate.
  const withRpc = (result: { data: unknown; error: unknown }) => {
    const rpc = vi.fn(async (fn: string) =>
      fn === "claim_admin"
        ? result
        : { data: null, error: { code: "PGRST202", message: "missing" } },
    );
    Object.assign(client, { rpc });
    return rpc;
  };
  const fields = { full_name: "Sam", email: "s@b.co", password: "longenough" };

  it("skips the check for a normal sign-up", async () => {
    const rpc = withRpc({ data: true, error: null });
    await redirectOf(signup({}, form(fields)));
    expect(rpc).not.toHaveBeenCalledWith("claim_admin", expect.anything());
  });

  it("explains a wrong or throttled passcode in settings", async () => {
    withRpc({ data: false, error: null });
    expect(
      (await claimAdmin({}, form({ passcode: "nope" }))).fieldErrors?.passcode,
    ).toBe("That passcode isn't right.");
    withRpc({ data: null, error: { code: "54000", message: "Too many" } });
    expect(
      (await claimAdmin({}, form({ passcode: "nope" }))).fieldErrors?.passcode,
    ).toMatch(/Too many/);
    withRpc({ data: true, error: null });
    expect(
      await redirectOf(claimAdmin({}, form({ passcode: "chapter-code" }))),
    ).toBe("/admin");
  });
});

describe("chapter code", () => {
  type Result = {
    data: unknown;
    error: { code?: string; message: string } | null;
  };
  // Each RPC answers from the table; anything not listed is a missing function (0090 not applied).
  const withRpcs = (answers: Record<string, Result>) => {
    const rpc = vi.fn(async (fn: string, args?: Record<string, unknown>) => {
      void args;
      return (
        answers[fn] ?? {
          data: null,
          error: { code: "PGRST202", message: "missing" },
        }
      );
    });
    Object.assign(client, { rpc });
    return rpc;
  };
  const gateOn = { chapter_gate_active: { data: true, error: null } };
  const fields = { full_name: "Sam", email: "s@b.co", password: "longenough" };
  const signUpData = () =>
    (
      client.auth.signUp.mock.calls[0] as unknown as [
        { options: { data: Record<string, string> } },
      ]
    )[0].options.data;

  it("signs up as before while migration 0090 isn't applied", async () => {
    const rpc = withRpcs({});
    expect(await redirectOf(signup({}, form(fields)))).toBe("/");
    expect(rpc).toHaveBeenCalledWith("chapter_gate_active");
    expect(rpc).not.toHaveBeenCalledWith(
      "check_chapter_code",
      expect.anything(),
    );
    expect(signUpData()).toEqual({ full_name: "Sam" });
  });

  it("skips the code when no gate is set, even if one is typed", async () => {
    const rpc = withRpcs({ chapter_gate_active: { data: false, error: null } });
    expect(
      await redirectOf(
        signup({}, form({ ...fields, chapter_code: "whatever" })),
      ),
    ).toBe("/");
    expect(rpc).not.toHaveBeenCalledWith(
      "check_chapter_code",
      expect.anything(),
    );
    expect(signUpData()).toEqual({ full_name: "Sam" });
  });

  it("asks for the code when a gate is on and none was typed", async () => {
    const rpc = withRpcs(gateOn);
    const state = await signup({}, form(fields));
    expect(state.fieldErrors?.chapter_code).toBe("Enter the chapter code.");
    expect(state.chapterGate).toBe(true);
    expect(rpc).not.toHaveBeenCalledWith(
      "check_chapter_code",
      expect.anything(),
    );
    expect(client.auth.signUp).not.toHaveBeenCalled();
  });

  it("shows the code field with the other field errors, without spending a try", async () => {
    const rpc = withRpcs(gateOn);
    const state = await signup(
      {},
      form({
        full_name: "",
        email: "s@b.co",
        password: "short",
        chapter_code: "bayview",
      }),
    );
    expect(state.fieldErrors?.full_name).toBeTruthy();
    expect(state.fieldErrors?.chapter_code).toBeUndefined();
    expect(state.chapterGate).toBe(true);
    expect(rpc).not.toHaveBeenCalledWith(
      "check_chapter_code",
      expect.anything(),
    );
  });

  it("refuses a wrong code with the generic error and never makes the account", async () => {
    withRpcs({ ...gateOn, check_chapter_code: { data: null, error: null } });
    const state = await signup(
      {},
      form({ ...fields, chapter_code: "nope-nope" }),
    );
    expect(state.fieldErrors?.chapter_code).toBe("Wrong chapter code");
    expect(state.chapterGate).toBe(true);
    expect(JSON.stringify(state.values)).not.toContain("nope-nope");
    expect(client.auth.signUp).not.toHaveBeenCalled();
  });

  it("says to wait when the network is rate limited", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    withRpcs({
      ...gateOn,
      check_chapter_code: {
        data: null,
        error: { code: "54000", message: "Too many wrong chapter codes" },
      },
    });
    const state = await signup(
      {},
      form({ ...fields, chapter_code: "bayview-2026" }),
    );
    expect(state.fieldErrors?.chapter_code).toBe(
      "Too many tries. Wait 10 minutes.",
    );
    expect(state.chapterGate).toBe(true);
    expect(client.auth.signUp).not.toHaveBeenCalled();
    expect(log).not.toHaveBeenCalled();
    log.mockRestore();
  });

  it("stops with a plain error when the server key is missing", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    const rpc = withRpcs(gateOn);
    adminClient = null;
    const state = await signup(
      {},
      form({ ...fields, chapter_code: "bayview-2026" }),
    );
    expect(state.error).toBe("Something went wrong. Try again.");
    expect(state.chapterGate).toBe(true);
    expect(rpc).not.toHaveBeenCalledWith(
      "check_chapter_code",
      expect.anything(),
    );
    expect(client.auth.signUp).not.toHaveBeenCalled();
    log.mockRestore();
  });

  it("checks the code against the caller's IP and signs up with the ticket", async () => {
    requestHeaders = new Headers({
      origin: "null",
      "x-forwarded-for": "203.0.113.7, 10.0.0.1",
    });
    const rpc = withRpcs({
      ...gateOn,
      check_chapter_code: { data: "t".repeat(48), error: null },
    });
    expect(
      await redirectOf(
        signup(
          {},
          form({ ...fields, grade: "10", chapter_code: "  bayview-2026 " }),
        ),
      ),
    ).toBe("/");
    expect(rpc).toHaveBeenCalledWith("check_chapter_code", {
      code: "bayview-2026",
      ip: "203.0.113.7",
    });
    expect(signUpData()).toEqual({
      full_name: "Sam",
      grade: "10",
      chapter_ticket: "t".repeat(48),
    });
  });

  it("says wrong code when the database refuses the account (ticket expired or code changed)", async () => {
    withRpcs({
      ...gateOn,
      check_chapter_code: { data: "t".repeat(48), error: null },
    });
    const signUp = client.auth.signUp;
    signUp.mockResolvedValueOnce({
      data: { session: null },
      error: { message: "Database error saving new user" },
    } as never);
    const state = await signup(
      {},
      form({ ...fields, chapter_code: "bayview-2026" }),
    );
    expect(state.fieldErrors?.chapter_code).toBe("Wrong chapter code");
    expect(state.chapterGate).toBe(true);
  });

  it("stops with a plain error when the gate can't be read", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    withRpcs({
      chapter_gate_active: {
        data: null,
        error: { code: "57014", message: "timeout" },
      },
    });
    const state = await signup({}, form(fields));
    expect(state.error).toBe("Something went wrong. Try again.");
    expect(client.auth.signUp).not.toHaveBeenCalled();
    expect(log).toHaveBeenCalled();
    log.mockRestore();
  });
});

describe("requestReset", () => {
  it("gives the same answer whether or not the account exists", async () => {
    const state = await requestReset({}, form({ email: "nobody@b.co" }));
    expect(state.ok).toMatch(/If that email has an account/);
    expect(client.auth.resetPasswordForEmail).toHaveBeenCalledWith(
      "nobody@b.co",
      {
        redirectTo: "https://hosa.example/auth/callback?next=/reset-password",
      },
    );
  });
});

describe("logout", () => {
  const DEVICE = "2b1c6f0e-7a0d-4c4f-9f43-3f1f8d2a9c11";
  beforeEach(() => jar.clear());

  it("signs out this device only and goes to login", async () => {
    expect(await redirectOf(logout())).toBe("/login");
    expect(client.auth.signOut).toHaveBeenCalledWith({ scope: "local" });
  });

  it("first stops this browser's phone notifications, so the next person on the phone doesn't see them", async () => {
    jar.set("hosa-push-device", { value: DEVICE });
    const order: string[] = [];
    client.query.delete.mockImplementation(() => {
      order.push("delete");
      return client.query;
    });
    client.auth.signOut.mockImplementation(async () => {
      order.push("signOut");
      return { error: null };
    });
    expect(await redirectOf(logout())).toBe("/login");
    expect(client.from).toHaveBeenCalledWith("push_subscriptions");
    expect(client.query.eq).toHaveBeenCalledWith("id", DEVICE);
    // Removed while the session still exists, so RLS lets the member delete their own row.
    expect(order).toEqual(["delete", "signOut"]);
    expect(jar.has("hosa-push-device")).toBe(false);
  });

  it("doesn't touch push rows when this browser never turned notifications on", async () => {
    expect(await redirectOf(logout())).toBe("/login");
    expect(client.query.delete).not.toHaveBeenCalled();
  });

  it("still signs out when removing the device fails", async () => {
    jar.set("hosa-push-device", { value: DEVICE });
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    client.from.mockImplementation(() => {
      throw new Error("network down");
    });
    expect(await redirectOf(logout())).toBe("/login");
    expect(client.auth.signOut).toHaveBeenCalledWith({ scope: "local" });
    log.mockRestore();
  });
});

describe("requestReset errors", () => {
  it("logs mail failures but tells the user the same thing", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    client = mockSupabase({
      authError: { message: "Error sending recovery email" },
    });
    const state = await requestReset({}, form({ email: "a@b.co" }));
    expect(state.ok).toMatch(/If that email has an account/);
    expect(log).toHaveBeenCalled();
    log.mockRestore();
  });
});

describe("updatePassword", () => {
  it("saves and signs out other devices", async () => {
    expect(
      await redirectOf(
        updatePassword(
          {},
          form({ password: "longenough", confirm: "longenough" }),
        ),
      ),
    ).toBe("/");
    expect(client.auth.updateUser).toHaveBeenCalledWith({
      password: "longenough",
    });
    expect(client.auth.signOut).toHaveBeenCalledWith({ scope: "others" });
  });

  it("stops phone notifications on the member's other devices, keeping this one", async () => {
    client = mockSupabase({ userId: "u-1" });
    jar.set("hosa-push-device", {
      value: "2b1c6f0e-7a0d-4c4f-9f43-3f1f8d2a9c11",
    });
    await redirectOf(
      updatePassword({}, form({ password: "longenough", confirm: "longenough" })),
    );
    expect(client.from).toHaveBeenCalledWith("push_subscriptions");
    expect(client.query.delete).toHaveBeenCalled();
    expect(client.query.eq).toHaveBeenCalledWith("user_id", "u-1");
    expect(client.query.neq).toHaveBeenCalledWith(
      "id",
      "2b1c6f0e-7a0d-4c4f-9f43-3f1f8d2a9c11",
    );
    jar.clear();
  });

  it("requires both fields to match", async () => {
    const state = await updatePassword(
      {},
      form({ password: "longenough", confirm: "different1" }),
    );
    expect(state.fieldErrors?.confirm).toBe("Passwords don't match.");
    expect(client.auth.updateUser).not.toHaveBeenCalled();
  });
});
