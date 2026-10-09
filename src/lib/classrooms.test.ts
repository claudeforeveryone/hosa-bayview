import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const rpc = vi.fn();
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => ({ rpc }) }));

const { getClassroom, getRoster } = await import("./classrooms");

beforeEach(() => rpc.mockReset());

describe("malformed classroom ids", () => {
  it("getClassroom treats them as not found without querying", async () => {
    expect(await getClassroom("garbage")).toBeNull();
    expect(rpc).not.toHaveBeenCalled();
  });

  it("getRoster returns nobody without querying", async () => {
    expect(await getRoster("garbage")).toEqual([]);
    expect(rpc).not.toHaveBeenCalled();
  });
});

describe("lookup failures", () => {
  it("getRoster surfaces database errors instead of showing an empty room", async () => {
    rpc.mockResolvedValue({ data: null, error: { message: "boom" } });
    await expect(getRoster("22222222-2222-4222-8222-222222222222")).rejects.toThrow("Roster lookup failed");
  });
});
