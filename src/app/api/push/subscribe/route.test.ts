import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const state = vi.hoisted(() => ({
  userId: "u1" as string | null | Error,
  rpc: vi.fn(),
  from: vi.fn(),
}));
vi.mock("@/lib/auth", () => ({
  getUserId: async () => {
    if (state.userId instanceof Error) throw state.userId;
    return state.userId;
  },
}));
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({ rpc: state.rpc, from: state.from }),
}));

import { DELETE, POST } from "./route";

const SITE = "https://hosa-bayview.vercel.app";
const FCM = "https://fcm.googleapis.com/fcm/send/abc123";
const P256DH = `B${"a".repeat(86)}`;
const AUTH = "a".repeat(22);
const SUB = { endpoint: FCM, keys: { p256dh: P256DH, auth: AUTH } };
const ROW = "2b1c6f0e-7a0d-4c4f-9f43-3f1f8d2a9c11";
const OLD_ROW = "9d0e5a2b-1111-4c4f-8f43-3f1f8d2a9c22";

// A stand-in for supabase.from("push_subscriptions"): records the calls, answers select with `row`.
function table(row: { sound: boolean } | null = null) {
  const calls: { op: string; args: unknown[] }[] = [];
  const chain: Record<string, unknown> = {};
  for (const op of ["select", "delete", "eq"]) {
    chain[op] = (...args: unknown[]) => {
      calls.push({ op, args });
      return chain;
    };
  }
  chain.maybeSingle = async () => ({ data: row, error: null });
  chain.then = (resolve: (r: unknown) => unknown) => resolve({ error: null });
  state.from.mockReturnValue(chain);
  return calls;
}

function call(
  method: "POST" | "DELETE",
  body: unknown,
  headers: Record<string, string> = { origin: SITE },
) {
  return new Request(`${SITE}/api/push/subscribe`, {
    method,
    headers: { "content-type": "application/json", ...headers },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

beforeEach(() => {
  state.userId = "u1";
  state.rpc.mockReset();
  state.from.mockReset();
});

describe("POST /api/push/subscribe", () => {
  it("saves the device through the RPC and answers 204", async () => {
    state.rpc.mockResolvedValue({ data: ROW, error: null });
    const res = await POST(call("POST", { ...SUB, sound: false }));
    expect(res.status).toBe(204);
    expect(state.rpc).toHaveBeenCalledWith("push_subscribe", {
      p_endpoint: FCM,
      p_p256dh: P256DH,
      p_auth: AUTH,
      p_sound: false,
    });
  });

  it("remembers the saved row in an HttpOnly cookie, so signing out can remove this device", async () => {
    state.rpc.mockResolvedValue({ data: ROW, error: null });
    const res = await POST(call("POST", { ...SUB, sound: true }));
    const cookie = res.headers.get("set-cookie") ?? "";
    expect(cookie).toContain(`hosa-push-device=${ROW}`);
    expect(cookie).toMatch(/HttpOnly/i);
    expect(cookie).toMatch(/SameSite=lax/i);
    expect(cookie).toMatch(/Path=\//);
    expect(cookie).toMatch(/Secure/i);
  });

  it("leaves the sound setting to the database when the browser doesn't send one and no device is remembered", async () => {
    state.rpc.mockResolvedValue({ data: ROW, error: null });
    await POST(call("POST", SUB));
    expect(state.rpc.mock.calls[0][1].p_sound).toBeNull();
    expect(state.from).not.toHaveBeenCalled();
  });

  it("carries this device's sound setting over when the service worker re-saves a rotated subscription", async () => {
    const calls = table({ sound: false });
    state.rpc.mockResolvedValue({ data: ROW, error: null });
    const res = await POST(
      call("POST", SUB, {
        origin: SITE,
        cookie: `other=1; hosa-push-device=${OLD_ROW}`,
      }),
    );
    expect(res.status).toBe(204);
    expect(state.rpc.mock.calls[0][1].p_sound).toBe(false);
    expect(calls).toContainEqual({ op: "select", args: ["sound"] });
    // The old subscription was replaced on this browser, so its row goes (RLS keeps it to the member's own).
    expect(calls).toContainEqual({ op: "delete", args: [] });
    expect(calls.filter((c) => c.op === "eq")).toEqual([
      { op: "eq", args: ["id", OLD_ROW] },
      { op: "eq", args: ["id", OLD_ROW] },
    ]);
  });

  it("keeps the remembered row when the same subscription is saved again", async () => {
    const calls = table({ sound: true });
    state.rpc.mockResolvedValue({ data: ROW, error: null });
    await POST(
      call("POST", { ...SUB, sound: true }, {
        origin: SITE,
        cookie: `hosa-push-device=${ROW}`,
      }),
    );
    expect(calls.some((c) => c.op === "delete")).toBe(false);
  });

  it("ignores a cookie that isn't a row id", async () => {
    state.rpc.mockResolvedValue({ data: ROW, error: null });
    await POST(
      call("POST", SUB, { origin: SITE, cookie: "hosa-push-device=1;drop" }),
    );
    expect(state.from).not.toHaveBeenCalled();
  });

  it("refuses a session without Stay signed in: the device would keep getting pushes after the browser closes", async () => {
    state.rpc.mockResolvedValue({ data: ROW, error: null });
    const res = await POST(
      call("POST", { ...SUB, sound: true }, {
        origin: SITE,
        cookie: "a=1; hosa-short-session=1",
      }),
    );
    expect(res.status).toBe(409);
    expect((await res.json()).error).toMatch(/Stay signed in/);
    expect(res.headers.get("set-cookie")).toBeNull();
    expect(state.rpc).not.toHaveBeenCalled();
    expect(state.from).not.toHaveBeenCalled();
  });

  it("saves as usual when the short-session marker is absent or not set to 1", async () => {
    state.rpc.mockResolvedValue({ data: ROW, error: null });
    for (const cookie of ["hosa-short-session=0", "not-hosa-short-session=1"]) {
      const res = await POST(call("POST", SUB, { origin: SITE, cookie }));
      expect(res.status).toBe(204);
    }
  });

  it("answers 401 to a signed-out browser without touching the database", async () => {
    state.userId = null;
    const res = await POST(call("POST", SUB));
    expect(res.status).toBe(401);
    expect(state.rpc).not.toHaveBeenCalled();
  });

  it("answers 503 when the auth server can't be reached", async () => {
    state.userId = new Error("Auth server unreachable");
    const res = await POST(call("POST", SUB));
    expect(res.status).toBe(503);
    expect(state.rpc).not.toHaveBeenCalled();
  });

  it("refuses a call from another site", async () => {
    for (const headers of [
      { origin: "https://evil.example" },
      { origin: SITE, "sec-fetch-site": "cross-site" },
    ] as Record<string, string>[]) {
      const res = await POST(call("POST", SUB, headers));
      expect(res.status).toBe(403);
    }
    expect(state.rpc).not.toHaveBeenCalled();
  });

  it("refuses a bad endpoint before touching the database", async () => {
    const res = await POST(
      call("POST", { ...SUB, endpoint: "https://evil.example/x" }),
    );
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("That push service is not allowed");
    expect(state.rpc).not.toHaveBeenCalled();
  });

  it("refuses a body that isn't JSON", async () => {
    const res = await POST(call("POST", "not json"));
    expect(res.status).toBe(400);
  });

  it("passes the database's device-limit refusal to the browser as 400", async () => {
    state.rpc.mockResolvedValue({
      error: {
        code: "53400",
        message: "This account already has 12 devices with notifications on",
      },
    });
    const res = await POST(call("POST", SUB));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toContain("12 devices");
  });

  it("hides unexpected database errors behind a plain message", async () => {
    state.rpc.mockResolvedValue({
      error: { code: "XX000", message: "internal detail" },
    });
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const res = await POST(call("POST", SUB));
    expect(res.status).toBe(500);
    expect((await res.json()).error).toBe(
      "Could not save this device. Try again.",
    );
    spy.mockRestore();
  });
});

describe("DELETE /api/push/subscribe", () => {
  it("deletes only this endpoint (RLS keeps it to the member's own rows) and answers 204", async () => {
    const eq = vi.fn(async () => ({ error: null }));
    state.from.mockReturnValue({ delete: () => ({ eq }) });
    const res = await DELETE(call("DELETE", { endpoint: FCM }));
    expect(res.status).toBe(204);
    expect(state.from).toHaveBeenCalledWith("push_subscriptions");
    expect(eq).toHaveBeenCalledWith("endpoint", FCM);
    // This browser no longer has a device row to remember.
    expect(res.headers.get("set-cookie") ?? "").toMatch(
      /hosa-push-device=;.*Max-Age=0/i,
    );
  });

  it("still turns a device off during a short session", async () => {
    const eq = vi.fn(async () => ({ error: null }));
    state.from.mockReturnValue({ delete: () => ({ eq }) });
    const res = await DELETE(
      call("DELETE", { endpoint: FCM }, { origin: SITE, cookie: "hosa-short-session=1" }),
    );
    expect(res.status).toBe(204);
    expect(eq).toHaveBeenCalledWith("endpoint", FCM);
  });

  it("answers 401 to a signed-out browser", async () => {
    state.userId = null;
    const res = await DELETE(call("DELETE", { endpoint: FCM }));
    expect(res.status).toBe(401);
    expect(state.from).not.toHaveBeenCalled();
  });

  it("refuses an endpoint off the allowlist", async () => {
    const res = await DELETE(
      call("DELETE", { endpoint: "http://fcm.googleapis.com/x" }),
    );
    expect(res.status).toBe(400);
    expect(state.from).not.toHaveBeenCalled();
  });
});
