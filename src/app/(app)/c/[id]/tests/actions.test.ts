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

const { createBlankTest, importQuestions, saveQuestion } =
  await import("./actions");

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
    expect(
      await redirectOf(createBlankTest({}, form({ classroom_id: ROOM }))),
    ).toBe(`/c/${ROOM}/tests/${TEST}/edit`);
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
    expect(
      (await createBlankTest({}, form({ classroom_id: ROOM }))).error,
    ).toMatch(/trainers and executives/);
    expect(client.from).not.toHaveBeenCalled();
  });

  it("rejects a missing or malformed classroom without touching the database", async () => {
    expect((await createBlankTest({}, form({}))).error).toMatch(
      /doesn't exist/,
    );
    expect(
      (await createBlankTest({}, form({ classroom_id: "nope" }))).error,
    ).toMatch(/doesn't exist/);
    expect(client.from).not.toHaveBeenCalled();
  });

  it("explains a row-level-security refusal", async () => {
    client = makeClient({
      data: null,
      error: { code: "42501", message: "denied" },
    });
    expect(
      (await createBlankTest({}, form({ classroom_id: ROOM }))).error,
    ).toMatch(/can only add tests here|add tests here/);
  });
});

// rpc results per function name; an array is used up one call at a time.
type Res = { data: unknown; error: { code?: string; message: string } | null };
function rpcClient(results: Record<string, Res | Res[]>) {
  const rpc = vi.fn(async (fn: string, _args: unknown) => {
    void _args;
    const r = results[fn];
    if (!r) throw new Error(`unexpected rpc ${fn}`);
    return Array.isArray(r) ? r.shift()! : r;
  });
  return { rpc, from: vi.fn() } as unknown as typeof client & {
    rpc: typeof rpc;
  };
}
const items = (n: number) =>
  Array.from({ length: n }, (_, i) => ({
    prompt: `Q${i + 1}`,
    options: ["a", "b", "c", "d"],
    correct: i % 4,
    explanation: "",
  }));

describe("importQuestions", () => {
  it("sends every question in one bulk call", async () => {
    const c = rpcClient({ import_questions_bulk: { data: 300, error: null } });
    client = c;
    const result = await importQuestions(TEST, items(300));
    expect(result).toMatchObject({ ok: "Added 300 questions.", added: 300 });
    expect(c.rpc).toHaveBeenCalledTimes(1);
    expect(c.rpc).toHaveBeenCalledWith("import_questions_bulk", {
      tid: TEST,
      items: items(300),
    });
  });

  it("takes up to 500 and refuses 501 without touching the database", async () => {
    const c = rpcClient({ import_questions_bulk: { data: 500, error: null } });
    client = c;
    expect((await importQuestions(TEST, items(500))).added).toBe(500);
    expect((await importQuestions(TEST, items(501))).error).toMatch(/500/);
    expect(c.rpc).toHaveBeenCalledTimes(1);
  });

  it("refuses a right answer outside the options without touching the database", async () => {
    const c = rpcClient({});
    client = c;
    const bad = [
      { prompt: "Q", options: ["a", "b"], correct: 3, explanation: "" },
    ];
    expect((await importQuestions(TEST, bad)).error).toMatch(/right answer/);
    expect(c.rpc).not.toHaveBeenCalled();
  });

  it("refuses two choices the same, like single add, without touching the database", async () => {
    const c = rpcClient({});
    client = c;
    const dup = [
      ...items(3),
      {
        prompt: "Q4",
        options: ["Femur", " femur"],
        correct: 0,
        explanation: "",
      },
    ];
    expect((await importQuestions(TEST, dup)).error).toBe(
      "Question 4 has two choices the same.",
    );
    expect(c.rpc).not.toHaveBeenCalled();
  });

  for (const code of ["PGRST202", "42883"]) {
    it(`falls back to the old import when the bulk function is missing (${code})`, async () => {
      const c = rpcClient({
        import_questions_bulk: {
          data: null,
          error: { code, message: "Could not find the function" },
        },
        import_questions: [
          { data: 300, error: null },
          { data: 100, error: null },
        ],
      });
      client = c;
      const result = await importQuestions(TEST, items(400));
      expect(result).toMatchObject({ added: 400, ok: "Added 400 questions." });
      // The old function takes 300 at a time.
      expect(
        c.rpc.mock.calls.map(([fn, args]) => [
          fn,
          (args as { items: unknown[] }).items.length,
        ]),
      ).toEqual([
        ["import_questions_bulk", 400],
        ["import_questions", 300],
        ["import_questions", 100],
      ]);
    });
  }

  it("says how many went in when the fallback stops part way", async () => {
    client = rpcClient({
      import_questions_bulk: {
        data: null,
        error: { code: "PGRST202", message: "missing" },
      },
      import_questions: [
        { data: 300, error: null },
        {
          data: null,
          error: { code: "22023", message: "Needs 2 to 5 options, none empty" },
        },
      ],
    });
    const result = await importQuestions(TEST, items(400));
    expect(result.added).toBe(300);
    expect(result.error).toBe(
      "Added 300 of 400. The rest didn't save: Needs 2 to 5 options, none empty.",
    );
  });

  it("passes the database's plain-language reason through", async () => {
    client = rpcClient({
      import_questions_bulk: {
        data: null,
        error: { code: "22023", message: "Question 7 has an empty option" },
      },
    });
    expect((await importQuestions(TEST, items(10))).error).toBe(
      "Question 7 has an empty option.",
    );
  });

  it("explains a permission refusal", async () => {
    client = rpcClient({
      import_questions_bulk: {
        data: null,
        error: { code: "42501", message: "denied" },
      },
    });
    expect((await importQuestions(TEST, items(1))).error).toMatch(
      /Only the trainer/,
    );
  });
});

describe("saveQuestion", () => {
  const q = (fields: Record<string, string>, choices: string[]) => {
    const f = form(fields);
    for (const c of choices) f.append("choice", c);
    return f;
  };

  it("saves through save_question with trimmed choices", async () => {
    const c = rpcClient({ save_question: { data: "id", error: null } });
    client = c;
    const result = await saveQuestion(
      TEST,
      null,
      {},
      q({ prompt: " Q? ", explanation: "", correct: "1" }, [" a ", "b"]),
    );
    expect(result.ok).toBe("Added.");
    expect(c.rpc).toHaveBeenCalledWith("save_question", {
      tid: TEST,
      qid: null,
      prompt: "Q?",
      options: ["a", "b"],
      correct: 1,
      explanation: "",
    });
  });

  it("checks the same rules as the editor before the database", async () => {
    const c = rpcClient({});
    client = c;
    const result = await saveQuestion(
      TEST,
      null,
      {},
      q({ prompt: "", explanation: "", correct: "5" }, ["a", "a"]),
    );
    expect(result.fieldErrors).toEqual({
      prompt: "Write the question.",
      choices: "Two choices are the same.",
    });
    expect(c.rpc).not.toHaveBeenCalled();
  });
});
