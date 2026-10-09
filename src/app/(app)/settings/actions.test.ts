import { beforeEach, describe, expect, it, vi } from "vitest";
import { makeClient } from "@/test/chain-client";

let client = makeClient({ data: null, error: null });
const refresh = vi.fn();
const ME = "11111111-1111-4111-8111-111111111111";

vi.mock("@/lib/supabase/server", () => ({ createClient: async () => client }));
vi.mock("next/cache", () => ({ refresh: () => refresh() }));
vi.mock("@/lib/auth", () => ({ requireProfile: async () => ({ id: ME, role: "trainee" }) }));

const { updateName, setAdminPasscode, changePassword } = await import("./actions");

const form = (fields: Record<string, string>) => {
  const f = new FormData();
  for (const [k, v] of Object.entries(fields)) f.set(k, v);
  return f;
};

beforeEach(() => {
  client = makeClient({ data: null, error: null });
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
  it("needs 12 characters, counted like Postgres", async () => {
    expect((await setAdminPasscode({}, form({ new_passcode: "short-one" }))).fieldErrors?.new_passcode).toMatch(/12/);
    // 12 emoji are 24 UTF-16 units but 12 characters: allowed.
    expect((await setAdminPasscode({}, form({ new_passcode: "🦷".repeat(12) }))).ok).toBeTruthy();
    expect((await setAdminPasscode({}, form({ new_passcode: "🦷".repeat(73) }))).fieldErrors?.new_passcode).toMatch(/72/);
  });

  it("explains a non-executive refusal", async () => {
    client = makeClient({ data: null, error: { code: "42501", message: "Only executives" } });
    expect((await setAdminPasscode({}, form({ new_passcode: "long-enough-passcode" }))).error).toMatch(/Only executives/);
  });
});

describe("changePassword", () => {
  it("stays on the page and confirms", async () => {
    const state = await changePassword({}, form({ password: "new-password", confirm: "new-password" }));
    expect(state.ok).toBe("Password changed.");
    expect(client.auth.signOut).toHaveBeenCalledWith({ scope: "others" });
  });

  it("checks the two match", async () => {
    const state = await changePassword({}, form({ password: "new-password", confirm: "new-passw0rd" }));
    expect(state.fieldErrors?.confirm).toBe("Passwords don't match.");
    expect(client.auth.updateUser).not.toHaveBeenCalled();
  });
});
