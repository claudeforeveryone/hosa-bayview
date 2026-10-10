import { beforeEach, describe, expect, it, vi } from "vitest";

type Result = {
  data: unknown;
  error: { message: string; code?: string } | null;
};

// Chainable stand-in for supabase.from(...). Each awaited chain takes the next queued result.
function makeClient(results: Result[]) {
  const calls: { op: string; args: unknown[] }[] = [];
  const queue = [...results];
  const chain: Record<string, unknown> = {};
  for (const op of [
    "insert",
    "update",
    "delete",
    "select",
    "eq",
    "order",
    "limit",
  ]) {
    chain[op] = (...args: unknown[]) => {
      calls.push({ op, args });
      return chain;
    };
  }
  chain.then = (resolve: (r: Result) => unknown) =>
    resolve(queue.shift() ?? { data: null, error: null });
  return {
    calls,
    from: vi.fn((table: string) => {
      calls.push({ op: "from", args: [table] });
      return chain;
    }),
  };
}

let client = makeClient([]);
const refresh = vi.fn();
const requireProfile = vi.fn(async () => ({
  id: "11111111-1111-4111-8111-111111111111",
  role: "trainer",
}));

vi.mock("@/lib/supabase/server", () => ({ createClient: async () => client }));
vi.mock("next/cache", () => ({ refresh: () => refresh() }));
vi.mock("@/lib/auth", () => ({ requireProfile: () => requireProfile() }));

const { saveSkill, deleteSkill } = await import("./actions");

const ROOM = "22222222-2222-4222-8222-222222222222";
const SKILL = "33333333-3333-4333-8333-333333333333";
const form = (fields: Record<string, string>) => {
  const f = new FormData();
  for (const [k, v] of Object.entries(fields)) f.set(k, v);
  return f;
};
const written = (op: string) =>
  client.calls.find((c) => c.op === op)?.args[0] as
    Record<string, unknown> | undefined;

beforeEach(() => {
  client = makeClient([]);
  refresh.mockClear();
  requireProfile.mockClear();
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("saveSkill (add)", () => {
  it("parses the steps and appends after the last skill", async () => {
    client = makeClient([
      { data: [{ position: 4 }], error: null },
      { data: null, error: null },
    ]);
    const state = await saveSkill(
      ROOM,
      null,
      {},
      form({
        name: " Hand hygiene ",
        round: "",
        steps: "Wash hands | 2\r\n\r\nDry hands",
        note: "",
      }),
    );
    expect(requireProfile).toHaveBeenCalled();
    expect(state.ok).toBeTruthy();
    expect(written("insert")).toEqual({
      classroom_id: ROOM,
      position: 5,
      name: "Hand hygiene",
      round: null,
      steps: [{ text: "Wash hands", points: 2 }, { text: "Dry hands" }],
      note: null,
    });
    expect(refresh).toHaveBeenCalled();
  });

  it("allows a skill with no steps yet", async () => {
    client = makeClient([
      { data: [], error: null },
      { data: null, error: null },
    ]);
    const state = await saveSkill(
      ROOM,
      null,
      {},
      form({
        name: "Oral exam",
        steps: "",
        note: "Steps: see the official HOSA guidelines",
      }),
    );
    expect(state.ok).toBeTruthy();
    expect(written("insert")).toMatchObject({
      position: 0,
      steps: [],
      note: "Steps: see the official HOSA guidelines",
    });
  });

  it("needs a name", async () => {
    const state = await saveSkill(
      ROOM,
      null,
      {},
      form({ name: "  ", steps: "x" }),
    );
    expect(state.fieldErrors?.name).toBeTruthy();
    expect(client.from).not.toHaveBeenCalled();
  });

  it("rejects points over 100 or with decimals, naming the step", async () => {
    let state = await saveSkill(
      ROOM,
      null,
      {},
      form({ name: "A", steps: "One\nTwo | 150" }),
    );
    expect(state.fieldErrors?.steps).toMatch(/Step 2/);
    state = await saveSkill(
      ROOM,
      null,
      {},
      form({ name: "A", steps: "One | 2.5" }),
    );
    expect(state.fieldErrors?.steps).toMatch(/Step 1.*whole/);
    expect(client.from).not.toHaveBeenCalled();
  });

  it("rejects a step over 500 characters and more than 100 steps", async () => {
    let state = await saveSkill(
      ROOM,
      null,
      {},
      form({ name: "A", steps: "x".repeat(501) }),
    );
    expect(state.fieldErrors?.steps).toMatch(/500/);
    state = await saveSkill(
      ROOM,
      null,
      {},
      form({
        name: "A",
        steps: Array.from({ length: 101 }, (_, i) => `Step ${i}`).join("\n"),
      }),
    );
    expect(state.fieldErrors?.steps).toMatch(/100/);
    expect(client.from).not.toHaveBeenCalled();
  });

  it("explains an RLS refusal", async () => {
    client = makeClient([
      { data: [], error: null },
      { data: null, error: { message: "rls", code: "42501" } },
    ]);
    const state = await saveSkill(
      ROOM,
      null,
      {},
      form({ name: "A", steps: "" }),
    );
    expect(state.error).toMatch(/trainer/);
    expect(refresh).not.toHaveBeenCalled();
  });

  it("rejects a bad classroom id without a query", async () => {
    const state = await saveSkill("nope", null, {}, form({ name: "A" }));
    expect(state.error).toBeTruthy();
    expect(client.from).not.toHaveBeenCalled();
  });
});

describe("saveSkill (edit)", () => {
  it("updates only the editable fields of that skill", async () => {
    client = makeClient([{ data: [{ id: SKILL }], error: null }]);
    const state = await saveSkill(
      ROOM,
      SKILL,
      {},
      form({ name: "B", round: "Round 1", steps: "Go | 1", note: "" }),
    );
    expect(state.ok).toBe("Saved.");
    expect(written("update")).toEqual({
      name: "B",
      round: "Round 1",
      steps: [{ text: "Go", points: 1 }],
      note: null,
    });
    const eqs = client.calls.filter((c) => c.op === "eq").map((c) => c.args);
    expect(eqs).toContainEqual(["id", SKILL]);
    expect(eqs).toContainEqual(["classroom_id", ROOM]);
  });

  it("reports when RLS filtered the update out", async () => {
    client = makeClient([{ data: [], error: null }]);
    const state = await saveSkill(ROOM, SKILL, {}, form({ name: "B" }));
    expect(state.error).toMatch(/trainer/);
    expect(refresh).not.toHaveBeenCalled();
  });
});

describe("deleteSkill", () => {
  it("deletes and refreshes", async () => {
    client = makeClient([{ data: [{ id: SKILL }], error: null }]);
    expect((await deleteSkill(ROOM, SKILL)).error).toBeUndefined();
    expect(refresh).toHaveBeenCalled();
  });

  it("reports when nothing was deleted", async () => {
    client = makeClient([{ data: [], error: null }]);
    expect((await deleteSkill(ROOM, SKILL)).error).toMatch(/trainer/);
  });
});
