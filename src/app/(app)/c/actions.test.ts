import { beforeEach, describe, expect, it, vi } from "vitest";

type Result = { data: unknown; error: { message: string; code?: string } | null };

// Chainable stand-in for supabase.from(...)/rpc(...). Every chain resolves to `result`.
function makeClient(result: Result) {
  const calls: { op: string; args: unknown[] }[] = [];
  const chain: Record<string, unknown> = {};
  for (const op of ["insert", "update", "delete", "select", "eq", "single"]) {
    chain[op] = (...args: unknown[]) => {
      calls.push({ op, args });
      return chain;
    };
  }
  chain.then = (resolve: (r: Result) => unknown) => resolve(result);
  return {
    calls,
    from: vi.fn((table: string) => {
      calls.push({ op: "from", args: [table] });
      return chain;
    }),
    rpc: vi.fn(async (fn: string, args: unknown) => {
      calls.push({ op: "rpc", args: [fn, args] });
      return result;
    }),
  };
}

let client = makeClient({ data: null, error: null });
let role: "executive" | "trainer" | "trainee" = "trainer";
const refresh = vi.fn();

vi.mock("@/lib/supabase/server", () => ({ createClient: async () => client }));
vi.mock("next/cache", () => ({ refresh: () => refresh() }));
vi.mock("next/navigation", () => ({
  redirect: (to: string) => {
    throw Object.assign(new Error("NEXT_REDIRECT"), { to });
  },
}));
vi.mock("@/lib/auth", () => ({
  requireProfile: async () => ({ id: "11111111-1111-4111-8111-111111111111", role }),
  canTeach: (p: { role: string }) => p.role !== "trainee",
}));

const actions = await import("./actions");

const ROOM = "22222222-2222-4222-8222-222222222222";
const USER = "33333333-3333-4333-8333-333333333333";
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
  client = makeClient({ data: null, error: null });
  role = "trainer";
  refresh.mockClear();
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("joinClassroom", () => {
  it("normalizes the code and lands in the classroom", async () => {
    client = makeClient({ data: ROOM, error: null });
    expect(await redirectOf(actions.joinClassroom({}, form({ code: " k7p-q2m " })))).toBe(`/c/${ROOM}`);
    expect(client.rpc).toHaveBeenCalledWith("join_classroom", { code: "K7PQ2M" });
  });

  it("rejects malformed codes without calling the database", async () => {
    const state = await actions.joinClassroom({}, form({ code: "abc" }));
    expect(state.fieldErrors?.code).toMatch(/6 characters/);
    expect(client.rpc).not.toHaveBeenCalled();
  });

  it("points at lookalike characters when the length is right", async () => {
    const state = await actions.joinClassroom({}, form({ code: "K7PQ20" }));
    expect(state.fieldErrors?.code).toMatch(/never use 0, O, 1, I or L/);
    expect(client.rpc).not.toHaveBeenCalled();
  });

  it("keeps the typed code and gives a retry message on database errors", async () => {
    client = makeClient({ data: null, error: { message: "connection reset" } });
    const state = await actions.joinClassroom({}, form({ code: "K7PQ2M" }));
    expect(state.error).toMatch(/Try again/);
    expect(state.values?.code).toBe("K7PQ2M");
  });

  it("says when no classroom matches", async () => {
    const state = await actions.joinClassroom({}, form({ code: "K7PQ2M" }));
    expect(state.fieldErrors?.code).toMatch(/No classroom/);
    expect(state.values?.code).toBe("K7PQ2M");
  });

  it("explains the guess limit", async () => {
    client = makeClient({ data: null, error: { message: "Too many tries", code: "54000" } });
    expect((await actions.joinClassroom({}, form({ code: "K7PQ2M" }))).error).toMatch(/10 minutes/);
  });
});

describe("createClassroom", () => {
  it("blocks trainees before touching the database", async () => {
    role = "trainee";
    const state = await actions.createClassroom({}, form({ name: "X", event: "", description: "" }));
    expect(state.error).toMatch(/Only trainers/);
    expect(client.from).not.toHaveBeenCalled();
  });

  it("validates the name", async () => {
    const state = await actions.createClassroom({}, form({ name: "   ", event: "", description: "" }));
    expect(state.fieldErrors?.name).toBeTruthy();
  });

  it("inserts only the editable fields and opens the new classroom", async () => {
    client = makeClient({ data: { id: ROOM }, error: null });
    const to = await redirectOf(
      actions.createClassroom({}, form({ name: " Med Term ", event: "Medical Terminology", description: "", owner_id: USER, join_code: "AAAAAA" })),
    );
    expect(to).toBe(`/c/${ROOM}`);
    const insert = client.calls.find((c) => c.op === "insert");
    expect(insert?.args[0]).toEqual({ name: "Med Term", event: "Medical Terminology", description: "" });
  });
});

describe("classroom category", () => {
  it("creates with the picked category", async () => {
    client = makeClient({ data: { id: ROOM }, error: null });
    await redirectOf(actions.createClassroom({}, form({ name: "Pharm", event: "", description: "", category: "practical" })));
    const insert = client.calls.find((c) => c.op === "insert");
    expect(insert?.args[0]).toEqual({ name: "Pharm", event: "", description: "", category: "practical" });
  });

  it("updates the category", async () => {
    client = makeClient({ data: [{ id: ROOM }], error: null });
    await actions.updateClassroom(ROOM, {}, form({ name: "N", event: "", description: "", category: "showcase" }));
    const update = client.calls.find((c) => c.op === "update");
    expect((update?.args[0] as { category: string }).category).toBe("showcase");
  });

  it("rejects an unknown category without writing", async () => {
    const state = await actions.createClassroom({}, form({ name: "X", event: "", description: "", category: "essay" }));
    expect(state.fieldErrors?.category).toBeTruthy();
    expect(client.from).not.toHaveBeenCalled();
  });
});

describe("updateClassroom", () => {
  it("counts CRLF newlines as one character, like the textarea does", async () => {
    client = makeClient({ data: [{ id: ROOM }], error: null });
    const description = `${"x".repeat(990)}\r\n${"y".repeat(8)}`;
    const state = await actions.updateClassroom(ROOM, {}, form({ name: "N", event: "", description }));
    expect(state.ok).toBe("Saved.");
    const update = client.calls.find((c) => c.op === "update");
    expect((update?.args[0] as { description: string }).description).toHaveLength(999);
  });


  it("reports when RLS filtered the update out", async () => {
    client = makeClient({ data: [], error: null });
    const state = await actions.updateClassroom(ROOM, {}, form({ name: "New", event: "", description: "" }));
    expect(state.error).toMatch(/can't edit/);
    expect(refresh).not.toHaveBeenCalled();
  });

  it("saves and refreshes", async () => {
    client = makeClient({ data: [{ id: ROOM }], error: null });
    const state = await actions.updateClassroom(ROOM, {}, form({ name: "New", event: "", description: "" }));
    expect(state.ok).toBe("Saved.");
    expect(refresh).toHaveBeenCalled();
  });

  it("rejects a bad id", async () => {
    expect((await actions.updateClassroom("nope", {}, form({ name: "New", event: "", description: "" }))).error).toBeTruthy();
    expect(client.from).not.toHaveBeenCalled();
  });
});

describe("deleteClassroom", () => {
  it("goes home after deleting", async () => {
    client = makeClient({ data: [{ id: ROOM }], error: null });
    expect(await redirectOf(actions.deleteClassroom(ROOM))).toBe("/");
  });

  it("refuses when nothing was deleted", async () => {
    client = makeClient({ data: [], error: null });
    expect((await actions.deleteClassroom(ROOM)).error).toMatch(/can't delete/);
  });
});

describe("regenerateCode", () => {
  it("maps permission errors", async () => {
    client = makeClient({ data: null, error: { message: "no", code: "42501" } });
    expect((await actions.regenerateCode(ROOM)).error).toMatch(/Only the trainer/);
  });

  it("confirms and refreshes", async () => {
    client = makeClient({ data: "K7PQ2M", error: null });
    expect((await actions.regenerateCode(ROOM)).ok).toMatch(/New code/);
    expect(refresh).toHaveBeenCalled();
  });
});

describe("members", () => {
  it("removes a member by classroom and user", async () => {
    client = makeClient({ data: [{ user_id: USER }], error: null });
    expect(await actions.removeMember(ROOM, USER)).toEqual({});
    const eqs = client.calls.filter((c) => c.op === "eq").map((c) => c.args);
    expect(eqs).toEqual([
      ["classroom_id", ROOM],
      ["user_id", USER],
    ]);
  });

  it("rejects malformed ids without touching the database", async () => {
    expect((await actions.removeMember(ROOM, "nope")).error).toBeTruthy();
    expect((await actions.removeMember("nope", USER)).error).toBeTruthy();
    expect(client.from).not.toHaveBeenCalled();
  });

  it("leaving only ever deletes your own row", async () => {
    client = makeClient({ data: [{ user_id: "me" }], error: null });
    expect(await redirectOf(actions.leaveClassroom(ROOM))).toBe("/");
    const eqs = client.calls.filter((c) => c.op === "eq").map((c) => c.args);
    expect(eqs).toContainEqual(["user_id", "11111111-1111-4111-8111-111111111111"]);
  });
});
