import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// The flag lists (a test's flags, a classroom's open flags) come from RPCs that predate 0231, so the reason (Ask
// teacher or a report) is read from question_flags for exactly the rows on screen. A long list is asked for in
// batches, so the answer can never be cut off at PostgREST's row limit, and a lookup that fails or meets a database
// without the reason column still shows every flag, as a plain question.
type Row = { id: string; test_id: string };
type Lookup = {
  data: unknown;
  error: { code: string; message: string } | null;
};

let rpcRows: Row[] = [];
let stored = new Map<string, string>();
let lookupError: Lookup["error"] = null;
const lookups: { table: string; column: string; values: string[] }[] = [];

vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    rpc: async () => ({ data: rpcRows, error: null }),
    from: (table: string) => ({
      select: () => ({
        in: async (column: string, values: string[]): Promise<Lookup> => {
          lookups.push({ table, column, values });
          if (lookupError) return { data: null, error: lookupError };
          // Only rows whose id is asked for come back.
          const data =
            column === "id"
              ? values
                  .filter((v) => stored.has(v))
                  .map((id) => ({ id, reason: stored.get(id) }))
              : [];
          return { data, error: null };
        },
      }),
    }),
  }),
}));

const { getClassroomFlags, getTestFlags } = await import("./tests");

const ROOM = "11111111-1111-4111-8111-111111111111";
const TEST = "22222222-2222-4222-8222-222222222222";
const id = (n: number) =>
  `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;

beforeEach(() => {
  rpcRows = [];
  stored = new Map();
  lookupError = null;
  lookups.length = 0;
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("flag reasons", () => {
  it("asks only for the flags on screen, by id", async () => {
    rpcRows = [
      { id: id(1), test_id: TEST },
      { id: id(2), test_id: TEST },
    ];
    stored = new Map([
      [id(1), "wrong_answer"],
      [id(2), "ask"],
      // Another flag on the same test that isn't on screen (answered, or someone else's).
      [id(3), "typo"],
    ]);
    const flags = await getClassroomFlags(ROOM);
    expect(flags.map((f) => f.reason)).toEqual(["wrong_answer", "ask"]);
    expect(lookups).toEqual([
      { table: "question_flags", column: "id", values: [id(1), id(2)] },
    ]);
  });

  it("splits a long list into batches and keeps every reason", async () => {
    rpcRows = Array.from({ length: 250 }, (_, i) => ({
      id: id(i + 1),
      test_id: TEST,
    }));
    stored = new Map(rpcRows.map((r, i) => [r.id, i % 2 ? "typo" : "unclear"]));
    const flags = await getTestFlags(TEST);
    expect(flags).toHaveLength(250);
    expect(flags[0].reason).toBe("unclear");
    expect(flags[249].reason).toBe("typo");
    expect(lookups.length).toBeGreaterThan(1);
    for (const l of lookups) expect(l.values.length).toBeLessThanOrEqual(100);
    expect(lookups.flatMap((l) => l.values)).toEqual(rpcRows.map((r) => r.id));
  });

  it("reads every flag as a plain question, quietly, before 0231 adds the column", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    rpcRows = [{ id: id(1), test_id: TEST }];
    lookupError = {
      code: "42703",
      message: "column question_flags.reason does not exist",
    };
    const flags = await getTestFlags(TEST);
    expect(flags).toHaveLength(1);
    expect(flags[0].reason).toBe("ask");
    expect(log).not.toHaveBeenCalled();
  });

  it("still shows the flags, as questions, when the lookup fails, and logs it", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    rpcRows = [
      { id: id(1), test_id: TEST },
      { id: id(2), test_id: TEST },
    ];
    lookupError = { code: "57014", message: "statement timeout" };
    const flags = await getClassroomFlags(ROOM);
    expect(flags.map((f) => f.reason)).toEqual(["ask", "ask"]);
    expect(log).toHaveBeenCalledTimes(1);
  });

  it("makes no lookup when there are no flags", async () => {
    expect(await getTestFlags(TEST)).toEqual([]);
    expect(lookups).toEqual([]);
  });
});
