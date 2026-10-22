import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// When hidden tests post (0298) is read apart from getTest, for managers only. A database without the column (42703)
// reads as nothing scheduled, and so does any other failure (logged), instead of breaking the test pages.
type Answer = {
  data: unknown;
  error: { code: string; message: string } | null;
};

let answer: Answer = { data: null, error: null };
const asked: { op: string; args: unknown[] }[] = [];

vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => {
    const chain: Record<string, unknown> = {};
    for (const op of ["select", "eq", "not", "maybeSingle"]) {
      chain[op] = (...args: unknown[]) => {
        asked.push({ op, args });
        return chain;
      };
    }
    chain.then = (resolve: (a: Answer) => unknown) => resolve(answer);
    return {
      from: (table: string) => {
        asked.push({ op: "from", args: [table] });
        return chain;
      },
    };
  },
}));

const { getPublishAt, getPublishTimes } = await import("./tests");

const ROOM = "11111111-1111-4111-8111-111111111111";
const TEST = "22222222-2222-4222-8222-222222222222";
const AT = "2026-10-27T13:00:00+00:00";

beforeEach(() => {
  answer = { data: null, error: null };
  asked.length = 0;
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("getPublishAt", () => {
  it("reads one test's publish_at", async () => {
    answer = { data: { publish_at: AT }, error: null };
    expect(await getPublishAt(TEST)).toBe(AT);
    expect(asked).toContainEqual({ op: "select", args: ["publish_at"] });
    expect(asked).toContainEqual({ op: "eq", args: ["id", TEST] });
  });

  it("is null for an unscheduled or unseen test, and for a malformed id without asking", async () => {
    expect(await getPublishAt(TEST)).toBeNull();
    answer = { data: { publish_at: null }, error: null };
    expect(await getPublishAt(TEST)).toBeNull();
    asked.length = 0;
    expect(await getPublishAt("nope")).toBeNull();
    expect(asked).toEqual([]);
  });

  it("reads a missing column as nothing scheduled quietly, and logs any other failure", async () => {
    answer = { data: null, error: { code: "42703", message: "no column" } };
    expect(await getPublishAt(TEST)).toBeNull();
    expect(console.error).not.toHaveBeenCalled();
    answer = { data: null, error: { code: "57014", message: "timeout" } };
    expect(await getPublishAt(TEST)).toBeNull();
    expect(console.error).toHaveBeenCalledWith(
      "Schedule lookup failed: timeout",
    );
  });
});

describe("getPublishTimes", () => {
  it("maps each scheduled test in the room by id", async () => {
    answer = {
      data: [
        { id: "a", publish_at: AT },
        { id: "b", publish_at: "2026-11-01T14:00:00+00:00" },
      ],
      error: null,
    };
    const times = await getPublishTimes(ROOM);
    expect([...times]).toEqual([
      ["a", AT],
      ["b", "2026-11-01T14:00:00+00:00"],
    ]);
    expect(asked).toContainEqual({ op: "eq", args: ["classroom_id", ROOM] });
    expect(asked).toContainEqual({
      op: "not",
      args: ["publish_at", "is", null],
    });
  });

  it("is empty without the column or on a failure (logged), and skips a malformed room", async () => {
    answer = { data: null, error: { code: "42703", message: "no column" } };
    expect((await getPublishTimes(ROOM)).size).toBe(0);
    expect(console.error).not.toHaveBeenCalled();
    answer = { data: null, error: { code: "57014", message: "timeout" } };
    expect((await getPublishTimes(ROOM)).size).toBe(0);
    expect(console.error).toHaveBeenCalledWith(
      "Schedule lookup failed: timeout",
    );
    asked.length = 0;
    expect((await getPublishTimes("nope")).size).toBe(0);
    expect(asked).toEqual([]);
  });
});
