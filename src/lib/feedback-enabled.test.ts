import { beforeEach, describe, expect, it, vi } from "vitest";

// feedbackEnabled: Send feedback and Report this question show only once migration 0231 is on the database. Before
// that the probe function is missing (PGRST202) and both entry points stay hidden, so no member meets a button that
// fails on send.
let reply: { data: unknown; error: { code: string; message: string } | null } =
  { data: null, error: null };
const calls = vi.fn();

vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    rpc: async (name: string) => {
      calls(name);
      return reply;
    },
  }),
}));

// A fresh module each time: a true answer is remembered for the life of the server process.
const load = async () => {
  vi.resetModules();
  return (await import("./feedback-enabled")).feedbackEnabled;
};

beforeEach(() => {
  reply = { data: null, error: null };
  calls.mockClear();
});

describe("feedbackEnabled", () => {
  it("is off while 0231 isn't applied, without logging an error", async () => {
    const quiet = vi.spyOn(console, "error").mockImplementation(() => {});
    reply = { data: null, error: { code: "PGRST202", message: "missing" } };
    expect(await (await load())()).toBe(false);
    expect(calls).toHaveBeenCalledWith("feedback_enabled");
    expect(quiet).not.toHaveBeenCalled();
    quiet.mockRestore();
  });

  it("is off, and says so in the log, when the check itself fails", async () => {
    const quiet = vi.spyOn(console, "error").mockImplementation(() => {});
    reply = { data: null, error: { code: "57014", message: "timeout" } };
    expect(await (await load())()).toBe(false);
    expect(quiet).toHaveBeenCalledTimes(1);
    quiet.mockRestore();
  });

  it("is on for a literal true, and stops asking once it is", async () => {
    const enabled = await load();
    reply = { data: true, error: null };
    expect(await enabled()).toBe(true);
    reply = { data: null, error: { code: "PGRST202", message: "missing" } };
    expect(await enabled()).toBe(true);
    expect(calls).toHaveBeenCalledTimes(1);
  });

  it("keeps asking while the answer is no", async () => {
    const enabled = await load();
    reply = { data: false, error: null };
    expect(await enabled()).toBe(false);
    reply = { data: true, error: null };
    expect(await enabled()).toBe(true);
    expect(calls).toHaveBeenCalledTimes(2);
  });
});
