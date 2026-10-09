import { beforeEach, describe, expect, it, vi } from "vitest";
import { makeClient } from "@/test/chain-client";

let client = makeClient({ data: null, error: null });
let role: "executive" | "trainer" | "trainee" = "trainer";

vi.mock("@/lib/supabase/server", () => ({ createClient: async () => client }));
vi.mock("next/cache", () => ({ refresh: vi.fn() }));
vi.mock("next/navigation", () => ({
  redirect: (to: string) => {
    throw Object.assign(new Error("NEXT_REDIRECT"), { to });
  },
}));
vi.mock("@/lib/auth", () => ({
  requireProfile: async () => ({
    id: "11111111-1111-4111-8111-111111111111",
    role,
  }),
  canTeach: (p: { role: string }) => p.role !== "trainee",
}));

const { createBlankTest } = await import("./actions");

const ROOM = "22222222-2222-4222-8222-222222222222";
const TEST = "44444444-4444-4444-8444-444444444444";
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
  client = makeClient({ data: { id: TEST }, error: null });
  role = "trainer";
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("createBlankTest", () => {
  it("inserts an unpublished untitled draft and opens its editor", async () => {
    expect(await redirectOf(createBlankTest({}, form({ classroom_id: ROOM })))).toBe(`/c/${ROOM}/tests/${TEST}/edit`);
    expect(client.calls).toContainEqual({
      op: "insert",
      args: [
        {
          title: "Untitled test",
          description: "",
          time_limit_minutes: null,
          is_published: false,
          classroom_id: ROOM,
        },
      ],
    });
  });

  it("is for trainers and executives only, without touching the database", async () => {
    role = "trainee";
    expect((await createBlankTest({}, form({ classroom_id: ROOM }))).error).toMatch(/trainers and executives/);
    expect(client.from).not.toHaveBeenCalled();
  });

  it("rejects a missing or malformed classroom without touching the database", async () => {
    expect((await createBlankTest({}, form({}))).error).toMatch(/doesn't exist/);
    expect((await createBlankTest({}, form({ classroom_id: "nope" }))).error).toMatch(/doesn't exist/);
    expect(client.from).not.toHaveBeenCalled();
  });

  it("explains a row-level-security refusal", async () => {
    client = makeClient({
      data: null,
      error: { code: "42501", message: "denied" },
    });
    expect((await createBlankTest({}, form({ classroom_id: ROOM }))).error).toMatch(
      /can only add tests here|add tests here/,
    );
  });
});
