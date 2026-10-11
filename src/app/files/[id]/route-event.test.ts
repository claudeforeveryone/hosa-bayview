import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

// The resource_opened usage event (0230) on /files/[id]: sent only once something actually opens, with nothing but
// "file" or "link", and never able to stop the redirect.
const state: {
  row: {
    url: string | null;
    path: string | null;
    file_name: string | null;
  } | null;
  rpc: () => Promise<{ error: { code: string; message: string } | null }>;
} = { row: null, rpc: async () => ({ error: null }) };
const rpc = vi.fn();
const pending: (() => Promise<void>)[] = [];

vi.mock("next/server", async (original) => ({
  ...(await original<typeof import("next/server")>()),
  after: (task: () => Promise<void>) => {
    pending.push(task);
  },
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    auth: { getClaims: async () => ({ data: { claims: { sub: "user-1" } } }) },
    from: () => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => ({ data: state.row, error: null }),
        }),
      }),
    }),
    storage: {
      from: () => ({
        createSignedUrl: async () => ({
          data: { signedUrl: "https://x.supabase.co/signed" },
          error: null,
        }),
      }),
    },
    rpc: (...args: unknown[]) => {
      rpc(...args);
      return state.rpc();
    },
  }),
}));

const { GET } = await import("./route");

const ID = "00000000-0000-4000-8000-000000000123";
const open = async () => {
  const res = await GET(new NextRequest(`http://localhost/files/${ID}`), {
    params: Promise.resolve({ id: ID }),
  });
  while (pending.length) await pending.shift()!();
  return res;
};

beforeEach(() => {
  state.row = null;
  state.rpc = async () => ({ error: null });
  rpc.mockClear();
  pending.length = 0;
});

describe("resource_opened", () => {
  it("a file that opens is one 'file' event", async () => {
    state.row = { url: null, path: "room/notes.pdf", file_name: "Notes.pdf" };
    const res = await open();
    expect(res.status).toBe(302);
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(rpc).toHaveBeenCalledWith("record_event", {
      p_name: "resource_opened",
      p_code: "file",
    });
  });

  it("a link that opens is one 'link' event, without the address", async () => {
    state.row = { url: "https://www.hosa.org/x", path: null, file_name: null };
    await open();
    expect(rpc).toHaveBeenCalledWith("record_event", {
      p_name: "resource_opened",
      p_code: "link",
    });
    expect(JSON.stringify(rpc.mock.calls)).not.toContain("hosa.org");
  });

  it("nothing is recorded when nothing opens", async () => {
    state.row = null;
    expect((await open()).status).toBe(404);
    state.row = { url: null, path: null, file_name: null };
    expect((await open()).status).toBe(404);
    expect(rpc).not.toHaveBeenCalled();
  });

  it("a failing event never touches the redirect", async () => {
    const quiet = vi.spyOn(console, "error").mockImplementation(() => {});
    state.row = { url: "https://www.hosa.org/x", path: null, file_name: null };
    state.rpc = async () => ({ error: { code: "XX000", message: "boom" } });
    expect((await open()).status).toBe(302);
    state.rpc = () => Promise.reject(new Error("offline"));
    expect((await open()).status).toBe(302);
    quiet.mockRestore();
  });
});
