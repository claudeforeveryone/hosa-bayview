import { beforeEach, describe, expect, it, vi } from "vitest";
import { makeClient } from "@/test/chain-client";

// The push sign-out helpers are server-only; tests run them directly.
vi.mock("server-only", () => ({}));

let client = makeClient({ data: null, error: null });
const refresh = vi.fn();
const ME = "11111111-1111-4111-8111-111111111111";

vi.mock("@/lib/supabase/server", () => ({ createClient: async () => client }));
vi.mock("next/cache", () => ({ refresh: () => refresh() }));
let role = "trainee";
vi.mock("@/lib/auth", () => ({ requireProfile: async () => ({ id: ME, email: "me@example.com", role }) }));
// This browser's push device (the HttpOnly cookie the subscribe route sets).
const DEVICE = "2b1c6f0e-7a0d-4c4f-9f43-3f1f8d2a9c11";
let deviceCookie: string | undefined = DEVICE;
vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) =>
      name === "hosa-push-device" && deviceCookie ? { name, value: deviceCookie } : undefined,
    delete: () => {},
  }),
}));

const { updateName, setAdminPasscode, changePassword } = await import("./actions");

const form = (fields: Record<string, string>) => {
  const f = new FormData();
  for (const [k, v] of Object.entries(fields)) f.set(k, v);
  return f;
};

beforeEach(() => {
  client = makeClient({ data: null, error: null });
  role = "trainee";
  refresh.mockClear();
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("updateName", () => {
  it("saves a trimmed name on your own row", async () => {
    const state = await updateName({}, form({ full_name: "  Bernice Au  " }));
    expect(state.ok).toBe("Saved.");
    expect(client.calls).toContainEqual({ op: "update", args: [{ full_name: "Bernice Au" }] });
    expect(client.calls).toContainEqual({ op: "eq", args: ["id", ME] });
  });

  it("needs at least 2 characters", async () => {
    expect((await updateName({}, form({ full_name: " J " }))).fieldErrors?.full_name).toBe("Enter your name.");
    expect(client.from).not.toHaveBeenCalled();
  });
});

describe("setAdminPasscode", () => {
  it("refuses a non-executive before calling the database (direct POST)", async () => {
    const state = await setAdminPasscode({}, form({ new_passcode: "long-enough-passcode" }));
    expect(state.error).toMatch(/Only executives/);
    expect(client.rpc).not.toHaveBeenCalled();
  });

  it("needs 12 characters, counted like Postgres", async () => {
    role = "executive";
    expect((await setAdminPasscode({}, form({ new_passcode: "short-one" }))).fieldErrors?.new_passcode).toMatch(/12/);
    // 12 emoji are 24 UTF-16 units but 12 characters: allowed.
    expect((await setAdminPasscode({}, form({ new_passcode: "🦷".repeat(12) }))).ok).toBeTruthy();
    expect((await setAdminPasscode({}, form({ new_passcode: "🦷".repeat(73) }))).fieldErrors?.new_passcode).toMatch(/72/);
  });

  it("explains a database refusal", async () => {
    role = "executive";
    client = makeClient({ data: null, error: { code: "42501", message: "Only executives" } });
    expect((await setAdminPasscode({}, form({ new_passcode: "long-enough-passcode" }))).error).toMatch(/Only executives/);
  });
});

describe("changePassword", () => {
  it("stays on the page and confirms", async () => {
    const state = await changePassword({}, form({ current: "old-password", password: "new-password", confirm: "new-password" }));
    expect(state.ok).toBe("Password changed.");
    expect(client.auth.signInWithPassword).toHaveBeenCalledWith({ email: "me@example.com", password: "old-password" });
    expect(client.auth.signOut).toHaveBeenCalledWith({ scope: "others" });
  });

  it("stops phone notifications on the member's other devices, keeping this one", async () => {
    deviceCookie = DEVICE;
    await changePassword({}, form({ current: "old-password", password: "new-password", confirm: "new-password" }));
    expect(client.calls).toContainEqual({ op: "from", args: ["push_subscriptions"] });
    expect(client.calls).toContainEqual({ op: "delete", args: [] });
    expect(client.calls).toContainEqual({ op: "eq", args: ["user_id", ME] });
    expect(client.calls).toContainEqual({ op: "neq", args: ["id", DEVICE] });
  });

  it("checks the two match", async () => {
    const state = await changePassword({}, form({ current: "old-password", password: "new-password", confirm: "new-passw0rd" }));
    expect(state.fieldErrors?.confirm).toBe("Passwords don't match.");
    expect(client.auth.updateUser).not.toHaveBeenCalled();
  });

  it("needs the current password", async () => {
    const state = await changePassword({}, form({ password: "new-password", confirm: "new-password" }));
    expect(state.fieldErrors?.current).toBe("Enter your current password.");
    expect(client.auth.updateUser).not.toHaveBeenCalled();
  });

  it("refuses a wrong current password without changing anything", async () => {
    client.auth.signInWithPassword.mockResolvedValueOnce({ error: { message: "Invalid login credentials" } });
    const state = await changePassword({}, form({ current: "guess", password: "new-password", confirm: "new-password" }));
    expect(state.fieldErrors?.current).toBe("That isn't your current password.");
    expect(client.auth.updateUser).not.toHaveBeenCalled();
    expect(client.auth.signOut).not.toHaveBeenCalled();
  });
});
